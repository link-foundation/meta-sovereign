// Ephemeral messages (layer 232, R-Y223): the three updates become effects,
// land in the store under their own `eph:` ids (never as `msg:` links) and
// are edited and deleted there; the chat's list, the callback press, the
// routes, and the page's pure helpers. Fake clients; nothing reaches a
// network, and no test meets today's date.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { updateEffect } from '../src/sources/telegram-updates.js';
import { createTelegramLive } from '../src/sources/telegram-account-live.js';
import { telegramDialogLinks } from '../src/sources/telegram-account.js';
import {
  createEphemeral,
  ephemeralLinkId,
} from '../src/sources/telegram-ephemeral.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import { isStreamedId } from '../src/server/routes-events.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { postRoute } from './helpers/post-route.js';
import { ephemeralFor, placeEphemeral } from '../src/web/chat-ephemeral.js';
import { firstUnreadId } from '../src/web/chat-model.js';
import { parseMessageParts } from '../src/web/message-parts.js';
import { missingReplies } from '../src/web/chat-replies.js';

const DATE = 1_700_000_000;
const BOT = { userId: 900 };

const ephemeralMessage = (fields = {}) => ({
  className: 'EphemeralMessage',
  id: 5,
  fromId: BOT,
  peerId: { channelId: 77 },
  receiverId: 1,
  date: DATE,
  message: 'Welcome, read the rules',
  entities: [{ className: 'MessageEntityBold', offset: 0, length: 7 }],
  ...fields,
});

const liveWith = (store) => {
  const touched = [];
  const live = createTelegramLive({
    store,
    toLinks: telegramDialogLinks,
    touch: async () => touched.push(1),
  });
  live.chats.set('-10077', {
    id: '-10077',
    title: 'Fake Group',
    isUser: false,
    isGroup: true,
    isChannel: true,
  });
  live.chats.set('900', {
    id: '900',
    title: 'Fake Bot',
    isUser: true,
    isGroup: false,
    isChannel: false,
  });
  return { live, touched };
};

test('the three ephemeral updates become effects with the chat the app uses', () => {
  const message = ephemeralMessage();
  assert.deepEqual(
    updateEffect({ className: 'UpdateNewEphemeralMessage', message }),
    { kind: 'ephemeral', chat: '-10077', message, entities: undefined }
  );
  assert.equal(
    updateEffect({ className: 'UpdateEditEphemeralMessage', message }).kind,
    'ephemeral'
  );
  // A bot's private chat: no peer, the bot itself is the chat.
  const privateMessage = ephemeralMessage({ peerId: undefined });
  assert.equal(
    updateEffect({
      className: 'UpdateNewEphemeralMessage',
      message: privateMessage,
    }).chat,
    '900'
  );
  assert.deepEqual(
    updateEffect({
      className: 'UpdateDeleteEphemeralMessages',
      peer: { channelId: 77 },
      ids: [5, 6],
    }),
    { kind: 'ephemeral-delete', chat: '-10077', ids: [5, 6] }
  );
  // The bot side's callback query is ignored.
  assert.equal(
    updateEffect({ className: 'UpdateEphemeralBotCallbackQuery' }),
    null
  );
});

test('a new ephemeral message is stored as eph:, never as msg:', async () => {
  const store = createMemoryStore();
  const { live, touched } = liveWith(store);
  await live.handle(null, {
    className: 'UpdateNewEphemeralMessage',
    message: ephemeralMessage({
      replyMarkup: { className: 'ReplyInlineMarkup', rows: [] },
    }),
  });
  const link = await store.get(ephemeralLinkId('-10077', 5));
  assert.equal(link.ephemeral, true);
  assert.equal(link.body, 'Welcome, read the rules');
  assert.equal(link.sender, '900');
  assert.equal(link.raw.entities[0].className, 'MessageEntityBold');
  assert.equal(link.raw.replyMarkup.className, 'ReplyInlineMarkup');
  assert.equal(link.timestamp, new Date(DATE * 1000).toISOString());
  const all = await store.query(() => true);
  assert.equal(
    all.filter((l) => l.id.startsWith('msg:')).length,
    0,
    'no msg: link'
  );
  assert.equal(touched.length, 1);
  assert.ok(isStreamedId(link.id), 'it is streamed to the page');
});

test('an edit replaces the message and a delete marks it deleted', async () => {
  const store = createMemoryStore();
  const { live } = liveWith(store);
  await live.handle(null, {
    className: 'UpdateNewEphemeralMessage',
    message: ephemeralMessage(),
  });
  await live.handle(null, {
    className: 'UpdateEditEphemeralMessage',
    message: ephemeralMessage({ message: 'Rules changed', entities: [] }),
  });
  const id = ephemeralLinkId('-10077', 5);
  assert.equal((await store.get(id)).body, 'Rules changed');
  assert.deepEqual((await store.get(id)).raw.entities, []);
  await live.handle(null, {
    className: 'UpdateDeleteEphemeralMessages',
    peer: { channelId: 77 },
    ids: [5, 404],
  });
  assert.equal((await store.get(id)).deleted, true);
  // Deleting again, or an unknown id, changes nothing.
  await live.handle(null, {
    className: 'UpdateDeleteEphemeralMessages',
    peer: { channelId: 77 },
    ids: [5],
  });
  assert.equal(await store.get(ephemeralLinkId('-10077', 404)), null);
});

test('a media-only ephemeral message from a bot chat is kept', async () => {
  const store = createMemoryStore();
  const { live } = liveWith(store);
  await live.handle(null, {
    className: 'UpdateNewEphemeralMessage',
    message: ephemeralMessage({
      id: 8,
      peerId: undefined,
      message: '',
      media: { className: 'MessageMediaPhoto', photo: { id: 1 } },
    }),
  });
  const link = await store.get(ephemeralLinkId('900', 8));
  assert.equal(link.chat, '900');
  assert.equal(link.raw.media.className, 'MessageMediaPhoto');
});

test("ephemeralMessages lists the chat's kept ones, deleted left out", async () => {
  const store = createMemoryStore();
  const { live } = liveWith(store);
  for (const id of [5, 6]) {
    await live.handle(null, {
      className: 'UpdateNewEphemeralMessage',
      message: ephemeralMessage({ id }),
    });
  }
  await live.handle(null, {
    className: 'UpdateNewEphemeralMessage',
    message: ephemeralMessage({ id: 1, peerId: undefined }),
  });
  await live.handle(null, {
    className: 'UpdateDeleteEphemeralMessages',
    peer: { channelId: 77 },
    ids: [6],
  });
  const { ephemeralMessages } = createEphemeral({ store }, {});
  const answer = await ephemeralMessages({ chat: '-10077' });
  assert.deepEqual(
    answer.messages.map((l) => l.id),
    [ephemeralLinkId('-10077', 5)]
  );
  assert.equal((await ephemeralMessages({ chat: 'x' })).ok, false);
});

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

const makeCallbacks = (answer) => {
  const log = [];
  const env = {
    importer: async () => ({
      Api: { ephemeral: { GetCallbackAnswer: named('GetCallbackAnswer') } },
      helpers: { returnBigInt: (v) => BigInt(v) },
    }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
  };
  const client = {
    invoke: async (request) => {
      log.push(request);
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    },
  };
  return { log, ...createEphemeral(env, { userClient: async () => client }) };
};

test('a button press asks ephemeral.getCallbackAnswer and shapes the answer', async () => {
  const { ephemeralCallback, log } = makeCallbacks({
    message: 'Rules accepted',
    alert: true,
  });
  const answer = await ephemeralCallback({
    chat: '-10077',
    id: 5,
    data: Buffer.from('rules').toString('base64'),
  });
  assert.deepEqual(answer, {
    ok: true,
    message: 'Rules accepted',
    alert: true,
    url: null,
  });
  assert.equal(log[0].className, 'GetCallbackAnswer');
  assert.equal(log[0].id, 5);
  assert.equal(log[0].peer.chat, '-10077');
  assert.equal(log[0].data.toString(), 'rules');
});

test('a press that times out is quiet, a gone message is named, bad input refused', async () => {
  const timeout = Object.assign(new Error('x'), {
    errorMessage: 'BOT_RESPONSE_TIMEOUT',
  });
  const quiet = await makeCallbacks(timeout).ephemeralCallback({
    chat: '5',
    id: 1,
    data: 'cnVsZXM=',
  });
  assert.deepEqual(quiet, {
    ok: true,
    message: null,
    alert: false,
    url: null,
  });
  const gone = Object.assign(new Error('x'), {
    errorMessage: 'MESSAGE_ID_INVALID',
  });
  const refused = await makeCallbacks(gone).ephemeralCallback({
    chat: '5',
    id: 1,
    data: 'cnVsZXM=',
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'message-gone');
  const { ephemeralCallback, log } = makeCallbacks({});
  assert.equal((await ephemeralCallback({ chat: '5', id: 0 })).ok, false);
  assert.equal(log.length, 0);
});

// ---- routes ----------------------------------------------------------------

const getRoute = async (query, account) => {
  const path = '/api/telegram/ephemeral';
  const req = Readable.from([]);
  Object.assign(req, {
    method: 'GET',
    url: `${path}${query}`,
    headers: { host: '127.0.0.1:8787' },
  });
  const res = {
    headers: {},
    setHeader() {},
    writeHead(status) {
      this.status = status;
    },
    end(text) {
      this.text = text;
    },
  };
  await handleTelegramRoutes(req, res, path, {
    telegramAccount: account,
    allowOrigins: [],
  });
  return res;
};

test('GET /api/telegram/ephemeral validates the chat and answers the list', async () => {
  const seen = [];
  const account = {
    ephemeralMessages: async (body) => {
      seen.push(body);
      return { ok: true, messages: [{ id: 'eph:telegram:5:1' }] };
    },
  };
  const good = await getRoute('?chat=-10077', account);
  assert.equal(good.status, 200);
  assert.deepEqual(JSON.parse(good.text).messages, [
    { id: 'eph:telegram:5:1' },
  ]);
  assert.deepEqual(seen, [{ chat: '-10077' }]);
  assert.equal((await getRoute('?chat=abc', account)).status, 400);
  assert.equal((await getRoute('', account)).status, 400);
  assert.equal(seen.length, 1);
});

test('POST ephemeral-callback is validated before the account is asked', async () => {
  const seen = [];
  const account = {
    ephemeralCallback: async (body) => {
      seen.push(body);
      return { ok: true };
    },
  };
  assert.equal(
    await postRoute(
      'ephemeral-callback',
      { chat: '-10077', id: 5, data: 'cnVsZXM=' },
      account
    ),
    200
  );
  for (const body of [
    { chat: 'x', id: 5, data: 'cnVsZXM=' },
    { chat: '5', id: '5', data: 'cnVsZXM=' },
    { chat: '5', id: 5, data: 'not base64!' },
    { chat: '5', id: 5 },
  ]) {
    assert.equal(await postRoute('ephemeral-callback', body, account), 400);
  }
  assert.deepEqual(seen, [{ chat: '-10077', id: 5, data: 'cnVsZXM=' }]);
});

// ---- the page's helpers ----------------------------------------------------

const link = (id, minutes, fields = {}) => ({
  id: `eph:telegram:5:${id}`,
  ephemeral: true,
  chat: '5',
  source: 'telegram',
  timestamp: new Date(Date.UTC(2026, 0, 1, 10, minutes)).toISOString(),
  body: `e${id}`,
  ...fields,
});
const normal = (id, minutes) => ({
  id: `msg:telegram:5:${id}`,
  chat: '5',
  source: 'telegram',
  timestamp: new Date(Date.UTC(2026, 0, 1, 10, minutes)).toISOString(),
  body: `m${id}`,
});

test('ephemeralFor merges the server list with streamed links, newest wins', () => {
  const fetched = [link(1, 5), link(2, 6), link(3, 7, { chat: '9' })];
  const streamed = [
    link(2, 6, { deleted: true }),
    link(4, 8),
    normal(1, 1),
    link(5, 9, { ephemeral: false }),
  ];
  assert.deepEqual(
    ephemeralFor(streamed, fetched, '5').map((l) => l.id),
    ['eph:telegram:5:1', 'eph:telegram:5:4']
  );
  assert.deepEqual(ephemeralFor(null, undefined, '5'), []);
});

test('placeEphemeral puts them among the messages by date', () => {
  const messages = [normal(1, 1), normal(2, 20)];
  const placed = placeEphemeral(messages, [link(7, 10)]);
  assert.deepEqual(
    placed.map((m) => m.id),
    ['msg:telegram:5:1', 'eph:telegram:5:7', 'msg:telegram:5:2']
  );
  assert.equal(placeEphemeral(messages, []), messages);
});

test('an ephemeral message is never the first unread one', () => {
  const messages = [normal(1, 1), link(9, 2), normal(3, 3)];
  assert.equal(firstUnreadId(messages, 0), null);
  assert.equal(firstUnreadId(messages, 1), 'msg:telegram:5:3');
});

test('a reply to an ephemeral message names the eph: link', () => {
  const reply = {
    ...normal(3, 3),
    replyTo: '5:7',
    raw: { replyTo: { replyToMsgId: 7, replyToEphemeral: true } },
  };
  const known = new Map([[link(7, 2).id, link(7, 2, { sender: '900' })]]);
  const parts = parseMessageParts(reply, known);
  assert.equal(parts.replyRef.linkId, 'eph:telegram:5:7');
  assert.equal(parts.replyRef.ephemeral, true);
  assert.equal(parts.replyRef.text, 'e7');
  // Unknown: a neutral reference, not a broken one.
  const unknown = parseMessageParts(reply, new Map()).replyRef;
  assert.equal(unknown.ephemeral, true);
  assert.equal(unknown.sender, null);
  // A normal reply is unchanged.
  const plain = parseMessageParts(
    { ...normal(4, 4), replyTo: '5:1', raw: { replyTo: { replyToMsgId: 1 } } },
    new Map()
  );
  assert.equal(plain.replyRef.linkId, 'msg:telegram:5:1');
  assert.equal(plain.replyRef.ephemeral, false);
  assert.deepEqual(missingReplies([reply], new Map()), ['eph:telegram:5:7']);
});
