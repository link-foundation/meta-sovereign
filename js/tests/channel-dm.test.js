// Channel direct messages and suggested posts (R-Y191): the requests built
// (saved dialogs and history under the monoforum, a reply naming the thread,
// a suggested post, the approval), Telegram's errors as codes, the shaping
// helpers, the routes and the page's pure parts. Fake clients; nothing
// reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createChannelDm } from '../src/sources/telegram-channel-dm.js';
import {
  actionOf,
  dmMessageOf,
  monoforumInfo,
  namesOf,
  priceOf,
  suggestedOf,
  threadOf,
} from '../src/sources/telegram-channel-dm-shape.js';
import {
  approveQuestion,
  canDecide,
  cardOf,
  decideBody,
  errorText,
  hasDirectMessages,
  perMessageNote,
  priceText,
  replyBody,
  scheduleOf,
  serviceText,
  suggestBody,
} from '../src/web/channel-dm-model.js';
import {
  helpers as fakeHelpers,
  named,
  telegramError,
} from './helpers/telegram-fakes.mjs';
import { postRoute } from './helpers/post-route.js';

const Api = {
  messages: {
    GetSavedDialogs: named('GetSavedDialogs'),
    GetSavedHistory: named('GetSavedHistory'),
    GetHistory: named('GetHistory'),
    SendMessage: named('SendMessage'),
    ToggleSuggestedPostApproval: named('ToggleSuggestedPostApproval'),
  },
  InputPeerEmpty: named('InputPeerEmpty'),
  InputPeerUser: named('InputPeerUser'),
  InputReplyToMonoForum: named('InputReplyToMonoForum'),
  SuggestedPost: named('SuggestedPost'),
  StarsAmount: named('StarsAmount'),
};
const helpers = {
  ...fakeHelpers,
  readBigIntFromBuffer: (bytes) =>
    BigInt(`0x${Buffer.from(bytes).toString('hex')}`),
};
const MONO = '-1009';

const make = (answer) => {
  const log = [];
  const client = {
    invoke: async (request) => {
      log.push(request);
      const next = answer(request);
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
  const actions = createChannelDm(
    {
      importer: async () => ({ Api, helpers }),
      connection: {
        withPeer: async (_c, chat, use) =>
          use({ className: 'Peer', chat, accessHash: 77n }),
      },
    },
    { userClient: async () => client }
  );
  return { actions, log };
};

const user = { id: 42n, accessHash: 5n, firstName: 'Ann', lastName: 'Lee' };
const message = (fields) => ({
  className: 'Message',
  id: 1,
  date: 1_700_000_000,
  message: 'hi',
  ...fields,
});

test('threads: saved dialogs under the monoforum, with names and last message', async () => {
  const { actions, log } = make(() => ({
    dialogs: [
      {
        className: 'MonoForumDialog',
        peer: { userId: 42n },
        topMessage: 9,
        unreadCount: 2,
      },
    ],
    messages: [message({ id: 9, message: 'hello admins' })],
    users: [user],
  }));
  const answer = await actions.channelDmThreads({ chat: MONO });
  assert.equal(answer.ok, true);
  assert.deepEqual(answer.threads[0], {
    peer: '42',
    name: 'Ann Lee',
    unread: 2,
    top: 9,
    at: new Date(1_700_000_000 * 1000).toISOString(),
    last: { id: 9, text: 'hello admins', out: false },
    free: false,
  });
  const [request] = log;
  assert.equal(request.className, 'GetSavedDialogs');
  assert.equal(request.parentPeer.chat, MONO);
  assert.equal(request.offsetPeer.className, 'InputPeerEmpty');
});

test('history: an admin asks the thread, a subscriber their own', async () => {
  const { actions, log } = make(() => ({
    messages: [message({ id: 5 }), message({ id: 3 })],
    users: [user],
  }));
  const admin = await actions.channelDmHistory({ chat: MONO, peer: '42' });
  assert.deepEqual(
    admin.messages.map((m) => m.id),
    [3, 5]
  );
  const asked = log.at(-1);
  assert.equal(asked.className, 'GetSavedHistory');
  assert.equal(asked.parentPeer.chat, MONO);
  assert.equal(asked.peer.className, 'Peer');
  await actions.channelDmHistory({ chat: MONO });
  assert.equal(log.at(-1).className, 'GetHistory');
  assert.equal(log.at(-1).peer.chat, MONO);
});

test('history: the input peer of a listed subscriber is reused', async () => {
  const { actions, log } = make((r) =>
    r.className === 'GetSavedDialogs'
      ? {
          dialogs: [
            {
              className: 'MonoForumDialog',
              peer: { userId: 42n },
              topMessage: 0,
            },
          ],
          messages: [],
          users: [user],
        }
      : { messages: [], users: [] }
  );
  await actions.channelDmThreads({ chat: MONO });
  await actions.channelDmHistory({ chat: MONO, peer: '42' });
  assert.equal(log.at(-1).peer.className, 'InputPeerUser');
  assert.equal(log.at(-1).peer.accessHash, 5n);
});

test('an admin reply carries the monoforum reply target', async () => {
  const { actions, log } = make(() => ({}));
  const answer = await actions.channelDmSend({
    chat: MONO,
    peer: '42',
    text: ' thanks ',
    clientId: 'c1',
  });
  assert.deepEqual(answer, { ok: true });
  const [request] = log;
  assert.equal(request.className, 'SendMessage');
  assert.equal(request.peer.chat, MONO);
  assert.equal(request.replyTo.className, 'InputReplyToMonoForum');
  assert.equal(request.replyTo.monoforumPeerId.className, 'Peer');
  assert.equal(request.allowPaidStars, undefined);
  assert.equal(request.suggestedPost, undefined);
  assert.equal(typeof request.randomId, 'bigint');
});

test('a subscriber suggests a post: price, date, and the price of the message', async () => {
  const { actions, log } = make(() => ({}));
  await actions.channelDmSend({
    chat: MONO,
    text: 'my post',
    stars: 5,
    suggestedPost: { stars: 50, scheduleDate: 1_900_000_000 },
  });
  const [request] = log;
  assert.equal(request.replyTo, undefined);
  assert.equal(request.allowPaidStars, 5n);
  assert.equal(request.suggestedPost.className, 'SuggestedPost');
  assert.equal(request.suggestedPost.price.amount, 50n);
  assert.equal(request.suggestedPost.price.nanos, 0);
  assert.equal(request.suggestedPost.scheduleDate, 1_900_000_000);
});

test('approve and decline call toggleSuggestedPostApproval', async () => {
  const { actions, log } = make(() => ({}));
  assert.deepEqual(
    await actions.channelDmDecide({
      chat: MONO,
      id: 12,
      approve: true,
      scheduleDate: 1_900_000_000,
    }),
    { ok: true, approved: true }
  );
  await actions.channelDmDecide({
    chat: MONO,
    id: 13,
    approve: false,
    comment: ' not now ',
  });
  const [yes, no] = log;
  assert.equal(yes.className, 'ToggleSuggestedPostApproval');
  assert.equal(yes.msgId, 12);
  assert.equal(yes.reject, undefined);
  assert.equal(yes.scheduleDate, 1_900_000_000);
  assert.equal(no.reject, true);
  assert.equal(no.rejectComment, 'not now');
  assert.equal(no.scheduleDate, undefined);
});

test('bad requests never reach Telegram', async () => {
  const { actions, log } = make(() => ({}));
  for (const bad of [
    () => actions.channelDmThreads({ chat: '42' }),
    () => actions.channelDmHistory({ chat: MONO, peer: 'x' }),
    () => actions.channelDmSend({ chat: MONO, text: '  ' }),
    () => actions.channelDmDecide({ chat: MONO, id: 0, approve: true }),
    () => actions.channelDmDecide({ chat: MONO, id: 3, approve: 'yes' }),
  ]) {
    assert.equal((await bad()).code, 'bad-request');
  }
  assert.equal(log.length, 0);
});

test('Telegram errors become codes with words', async () => {
  const codes = {
    ALLOW_PAYMENT_REQUIRED_5: 'payment-required',
    BALANCE_TOO_LOW: 'balance',
    CHAT_ADMIN_REQUIRED: 'admin-required',
    MESSAGE_ID_INVALID: 'gone',
    SCHEDULE_DATE_INVALID: 'bad-date',
    SUGGESTED_POST_PEER_INVALID: 'not-allowed',
    CHANNEL_PRIVATE: 'no-access',
    SOMETHING_NEW: 'failed',
  };
  for (const [name, code] of Object.entries(codes)) {
    const { actions } = make(() => telegramError(name));
    const answer = await actions.channelDmSend({ chat: MONO, text: 'x' });
    assert.equal(answer.code, code, name);
  }
});

test('without a connected account nothing is supported', async () => {
  const actions = createChannelDm(
    { importer: async () => ({ Api, helpers }) },
    { userClient: async () => null }
  );
  assert.equal(
    (await actions.channelDmThreads({ chat: MONO })).supported,
    false
  );
});

test('shaping: prices, suggested post status, service messages', () => {
  assert.deepEqual(
    priceOf({ className: 'StarsAmount', amount: 50n, nanos: 500_000_000 }),
    { currency: 'stars', amount: 50.5 }
  );
  assert.deepEqual(
    priceOf({ className: 'StarsTonAmount', amount: 2_500_000_000n }),
    { currency: 'ton', amount: 2.5 }
  );
  assert.equal(priceOf(null), null);
  const price = { className: 'StarsAmount', amount: 10n, nanos: 0 };
  const post = (fields) => ({ className: 'SuggestedPost', price, ...fields });
  assert.equal(suggestedOf(post({})).status, 'pending');
  assert.equal(suggestedOf(post({ accepted: true })).status, 'accepted');
  assert.equal(suggestedOf(post({ rejected: true })).status, 'rejected');
  assert.equal(
    suggestedOf(post({ scheduleDate: 1_700_000_000 })).at,
    '2023-11-14T22:13:20.000Z'
  );
  assert.equal(suggestedOf(undefined), null);
  assert.deepEqual(
    actionOf({
      className: 'MessageActionSuggestedPostApproval',
      rejected: true,
      rejectComment: 'no',
    }),
    {
      type: 'approval',
      rejected: true,
      balanceTooLow: false,
      comment: 'no',
      price: null,
      at: null,
    }
  );
  assert.equal(
    actionOf({ className: 'MessageActionSuggestedPostSuccess', price }).type,
    'success'
  );
  assert.equal(
    actionOf({
      className: 'MessageActionSuggestedPostRefund',
      payerInitiated: true,
    }).payerInitiated,
    true
  );
  assert.equal(actionOf({ className: 'MessageActionPinMessage' }), null);
});

test('shaping: a message of a thread keeps its card and its service text', () => {
  const names = namesOf([user]);
  const shaped = dmMessageOf(
    message({
      id: 7,
      fromId: { userId: 42n },
      savedPeerId: { userId: 42n },
      suggestedPost: {
        className: 'SuggestedPost',
        accepted: true,
        price: { className: 'StarsAmount', amount: 3n, nanos: 0 },
      },
    }),
    names
  );
  assert.equal(shaped.name, 'Ann Lee');
  assert.equal(shaped.thread, '42');
  assert.equal(shaped.suggested.status, 'accepted');
  const service = dmMessageOf(
    message({
      action: { className: 'MessageActionSuggestedPostRefund' },
    })
  );
  assert.equal(service.service.type, 'refund');
  assert.equal(threadOf({ className: 'ForumTopic' }, new Map(), names), null);
});

test('a channel with a linked monoforum says so; its admins are told apart', () => {
  assert.equal(monoforumInfo({ title: 'C' }, []), null);
  const chats = [{ id: 9n, title: 'Chat C', sendPaidMessagesStars: 7n }];
  assert.deepEqual(
    monoforumInfo(
      { linkedMonoforumId: 9n, broadcastMessagesAllowed: true },
      chats
    ),
    { id: '-1009', title: 'Chat C', price: 7, allowed: true, admin: false }
  );
  assert.equal(
    monoforumInfo(
      { linkedMonoforumId: 9n, adminRights: { manageDirectMessages: true } },
      chats
    ).admin,
    true
  );
  assert.equal(
    monoforumInfo({ linkedMonoforumId: 9n, creator: true }, []).admin,
    true
  );
});

test('page: the button, the note, the card and the questions', () => {
  const t = (key, params = {}) =>
    `${key}${Object.keys(params).length ? JSON.stringify(params) : ''}`;
  const api = { telegramChannelDmHistory: () => {} };
  const chat = { source: 'telegram', chat: '-1001' };
  assert.equal(hasDirectMessages(chat, { monoforum: { id: MONO } }, api), true);
  assert.equal(hasDirectMessages(chat, {}, api), false);
  assert.equal(hasDirectMessages(chat, { monoforum: { id: MONO } }, {}), false);
  assert.equal(perMessageNote(t, 0), null);
  assert.equal(perMessageNote(t, 5), 'chat.dm.perMessage{"count":5}');
  assert.equal(priceText({ currency: 'stars', amount: 50 }), '50 ⭐');
  assert.equal(priceText({ currency: 'ton', amount: 1.5 }), '1.5 TON');
  assert.equal(priceText(null), '');
  const pending = {
    id: 4,
    out: false,
    suggested: { status: 'pending', price: { currency: 'stars', amount: 50 } },
  };
  assert.equal(cardOf(pending).status, 'pending');
  assert.equal(cardOf({ id: 1 }), null);
  assert.equal(canDecide(pending, true), true);
  assert.equal(canDecide(pending, false), false);
  assert.equal(canDecide({ ...pending, out: true }, true), false);
  assert.equal(
    canDecide(
      { ...pending, suggested: { ...pending.suggested, status: 'accepted' } },
      true
    ),
    false
  );
  assert.equal(
    approveQuestion(t, pending),
    'chat.dm.approveAsk{"price":"50 ⭐"}'
  );
  assert.equal(
    approveQuestion(t, { suggested: { status: 'pending' } }),
    'chat.dm.approveAskFree'
  );
  assert.equal(errorText(t, 'x'), 'chat.dm.err.failed');
  const words = (key) => (key === 'chat.dm.err.balance' ? 'low' : key);
  assert.equal(errorText(words, 'balance'), 'low');
});

test('page: service messages as text', () => {
  const t = (key, params = {}) =>
    `${key}${Object.keys(params).length ? JSON.stringify(params) : ''}`;
  assert.equal(
    serviceText(t, { type: 'approval', balanceTooLow: true }),
    'chat.dm.svc.balance'
  );
  assert.equal(
    serviceText(t, { type: 'approval', rejected: true, comment: 'no' }),
    'chat.dm.svc.rejectedWhy{"comment":"no"}'
  );
  assert.equal(
    serviceText(t, { type: 'approval', rejected: true }),
    'chat.dm.svc.rejected'
  );
  assert.equal(
    serviceText(t, { type: 'approval', at: 'D' }, (at) => `<${at}>`),
    'chat.dm.svc.approvedAt{"date":"<D>"}'
  );
  assert.equal(serviceText(t, { type: 'approval' }), 'chat.dm.svc.approved');
  assert.equal(
    serviceText(t, {
      type: 'success',
      price: { currency: 'ton', amount: 2 },
    }),
    'chat.dm.svc.success{"price":"2 TON"}'
  );
  assert.equal(serviceText(t, { type: 'refund' }), 'chat.dm.svc.refund');
  assert.equal(
    serviceText(t, { type: 'refund', payerInitiated: true }),
    'chat.dm.svc.refundPayer'
  );
  assert.equal(
    serviceText(t, { type: 'price', stars: 0 }),
    'chat.dm.svc.priceFree'
  );
  assert.equal(serviceText(t, { type: 'other' }), null);
});

test('page: bodies, with the clock passed in', () => {
  const NOW = Date.parse('2030-01-01T00:00:00Z');
  assert.equal(scheduleOf('', NOW), null);
  assert.equal(scheduleOf('2029-01-01T00:00:00Z', NOW), null);
  assert.equal(
    scheduleOf('2031-01-01T00:00:00Z', NOW),
    Date.parse('2031-01-01T00:00:00Z') / 1000
  );
  assert.deepEqual(
    suggestBody(
      { chat: MONO, text: ' post ', price: '50', date: '', stars: 5 },
      NOW
    ),
    { chat: MONO, text: 'post', suggestedPost: { stars: 50 }, stars: 5 }
  );
  assert.equal(
    suggestBody(
      { chat: MONO, text: 'p', price: '1', date: '2031-01-01T00:00:00Z' },
      NOW
    ).suggestedPost.scheduleDate,
    Date.parse('2031-01-01T00:00:00Z') / 1000
  );
  for (const wrong of [
    { text: '', price: '1' },
    { text: 'p', price: '-1' },
    { text: 'p', price: '1.5' },
    { text: 'p', price: 'x' },
    { text: 'p', price: '1', date: '2020-01-01T00:00:00Z' },
  ]) {
    assert.equal(suggestBody({ chat: MONO, ...wrong }, NOW), null);
  }
  assert.deepEqual(replyBody({ chat: MONO, peer: '42', text: ' hi ' }), {
    chat: MONO,
    text: 'hi',
    peer: '42',
  });
  assert.equal(replyBody({ chat: MONO, text: ' ' }), null);
  const post = {
    id: 8,
    suggested: { at: '2031-01-01T00:00:00.000Z' },
  };
  assert.deepEqual(
    decideBody({ chat: MONO, message: post, approve: true, comment: 'x' }),
    { chat: MONO, id: 8, approve: true, scheduleDate: 1_924_992_000 }
  );
  assert.deepEqual(
    decideBody({ chat: MONO, message: post, approve: false, comment: ' no ' }),
    { chat: MONO, id: 8, approve: false, comment: 'no' }
  );
});

test('routes: strict bodies, the account asked once', async () => {
  const calls = [];
  const account = Object.fromEntries(
    ['Threads', 'History', 'Send', 'Decide'].map((name) => [
      `channelDm${name}`,
      async (body) => {
        calls.push([name, body]);
        return { ok: true };
      },
    ])
  );
  assert.equal(
    await postRoute('channel-dm-threads', { chat: MONO }, account),
    200
  );
  assert.equal(
    await postRoute('channel-dm-threads', { chat: '42' }, account),
    400
  );
  assert.equal(
    await postRoute('channel-dm-history', { chat: MONO, peer: '42' }, account),
    200
  );
  assert.equal(
    await postRoute('channel-dm-history', { chat: MONO, peer: 'x' }, account),
    400
  );
  assert.equal(
    await postRoute(
      'channel-dm-send',
      { chat: MONO, text: 'hi', peer: '42', stars: 3 },
      account
    ),
    200
  );
  assert.equal(
    await postRoute(
      'channel-dm-send',
      {
        chat: MONO,
        text: 'hi',
        suggestedPost: { stars: 10, scheduleDate: 1_900_000_000 },
      },
      account
    ),
    200
  );
  for (const wrong of [
    { chat: MONO, text: '' },
    { chat: MONO, text: 'x', stars: 0 },
    { chat: MONO, text: 'x', suggestedPost: { stars: 0 } },
    { chat: MONO, text: 'x', suggestedPost: 'free' },
    { chat: MONO, text: 'x', suggestedPost: { stars: 1, scheduleDate: 'x' } },
  ]) {
    assert.equal(await postRoute('channel-dm-send', wrong, account), 400);
  }
  assert.equal(
    await postRoute(
      'channel-dm-decide',
      { chat: MONO, id: 4, approve: false, comment: 'no' },
      account
    ),
    200
  );
  for (const wrong of [
    { chat: MONO, id: 4 },
    { chat: MONO, id: 0, approve: true },
    { chat: MONO, id: 4, approve: true, comment: 5 },
    { chat: MONO, id: 4, approve: true, scheduleDate: -1 },
  ]) {
    assert.equal(await postRoute('channel-dm-decide', wrong, account), 400);
  }
  assert.equal(
    await postRoute(
      'channel-dm-decide',
      { chat: MONO, id: 4, approve: true },
      {}
    ),
    400
  );
  assert.deepEqual(
    calls.map(([name]) => name),
    ['Threads', 'History', 'Send', 'Send', 'Decide']
  );
});
