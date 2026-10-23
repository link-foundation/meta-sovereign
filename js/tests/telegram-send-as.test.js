// "Send as" (R-Y141): who may send in a supergroup (channels.getSendAs)
// and by default (getFullChannel), the choice saved, `send_as` on every
// send path (text, files, voice, stickers and GIFs, polls), Telegram's
// refusals as codes, strict route validation and the page's helpers.
// Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSendAs } from '../src/sources/telegram-send-as.js';
import { withSendAs } from '../src/sources/telegram-send-as-client.js';
import { createStickers } from '../src/sources/telegram-stickers.js';
import { createPollActions } from '../src/sources/telegram-polls.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { sendError, sendText } from '../src/sources/telegram-send.js';
import { postRoute } from './helpers/post-route.js';
import { canChooseSendAs, sendAsField } from '../src/web/chat-send-as.js';
import { failureText } from '../src/web/chat-failure.js';

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

const Api = {
  channels: {
    GetSendAs: named('channels.GetSendAs'),
    GetFullChannel: named('channels.GetFullChannel'),
  },
  messages: {
    SaveDefaultSendAs: named('messages.SaveDefaultSendAs'),
    SendMedia: named('messages.SendMedia'),
    SendMessage: named('messages.SendMessage'),
  },
  InputPeerUser: named('InputPeerUser'),
  InputPeerChannel: named('InputPeerChannel'),
  InputDocument: named('InputDocument'),
  InputMediaDocument: named('InputMediaDocument'),
  Poll: named('Poll'),
  InputPollAnswer: named('InputPollAnswer'),
  TextWithEntities: named('TextWithEntities'),
  InputMediaPoll: named('InputMediaPoll'),
};
const helpers = {
  returnBigInt: (v) => BigInt(v),
  readBigIntFromBuffer: (b) => b.readBigInt64LE(0),
};

const GROUP = '-1001234';
const CHANNEL = '-1005555';

const sendAsAnswer = {
  peers: [
    { className: 'SendAsPeer', peer: { className: 'PeerUser', userId: 42n } },
    {
      className: 'SendAsPeer',
      premiumRequired: true,
      peer: { className: 'PeerChannel', channelId: 5555n },
    },
  ],
  users: [{ id: 42n, firstName: 'Ann', lastName: 'Lee', accessHash: 7n }],
  chats: [
    {
      className: 'Channel',
      id: 5555n,
      title: 'News',
      username: 'news',
      participantsCount: 1200,
      accessHash: 55n,
    },
  ],
};

const telegramError = (errorMessage) =>
  Object.assign(new Error(errorMessage), { errorMessage });

const makeClient = ({ defaultSendAs = null, fail = null, premium = true }) => {
  const log = [];
  const client = {
    invoke: async function invoke(request) {
      log.push(request);
      if (fail?.[request.className]) {
        throw telegramError(fail[request.className]);
      }
      if (request.className === 'channels.GetSendAs') {
        return sendAsAnswer;
      }
      if (request.className === 'channels.GetFullChannel') {
        return { fullChat: { defaultSendAs } };
      }
      return { className: 'Updates' };
    },
    getMe: async () => ({ premium }),
    getInputEntity: async (peer) => ({ resolved: String(peer?.id ?? peer) }),
  };
  return { client, log };
};

const makeActions = (options = {}) => {
  const { client, log } = makeClient(options);
  let clock = 0;
  const actions = createSendAs(
    {
      importer: async () => ({ Api, helpers }),
      connection: { withPeer: async (_c, chat, use) => use({ id: chat }) },
      now: () => clock,
    },
    { userClient: async () => client }
  );
  return { actions, log, advance: (ms) => (clock += ms) };
};

test('getSendAs: the identities with names, kinds, counts and Premium', async () => {
  const { actions, log } = makeActions({
    defaultSendAs: { className: 'PeerChannel', channelId: 5555n },
  });
  const got = await actions.sendAsList({ chat: GROUP });
  assert.deepEqual(got, {
    ok: true,
    current: CHANNEL,
    premium: true,
    peers: [
      { id: '42', kind: 'user', name: 'Ann Lee' },
      {
        id: CHANNEL,
        kind: 'channel',
        name: 'News',
        username: 'news',
        count: 1200,
        premium: true,
      },
    ],
  });
  assert.equal(log[0].className, 'channels.GetSendAs');
  assert.deepEqual(log[0].peer, { id: GROUP });
  assert.equal(log[1].className, 'channels.GetFullChannel');
});

test('without a saved default the user is the current identity', async () => {
  const { actions } = makeActions({ premium: false });
  const got = await actions.sendAsList({ chat: GROUP });
  assert.equal(got.current, '42');
  assert.equal(got.premium, false);
});

test('the list is kept for minutes per chat, then asked again', async () => {
  const { actions, log, advance } = makeActions();
  await actions.sendAsList({ chat: GROUP });
  const asked = log.length;
  await actions.sendAsList({ chat: GROUP });
  assert.equal(log.length, asked);
  advance(4 * 60_000);
  await actions.sendAsList({ chat: GROUP });
  assert.ok(log.length > asked);
});

test('only supergroups are asked; basic groups and people are not', async () => {
  const { actions, log } = makeActions();
  for (const chat of ['-5', '42', 'x', undefined]) {
    assert.equal((await actions.sendAsList({ chat })).ok, false);
  }
  assert.equal(log.length, 0);
});

test('saveDefaultSendAs: the peer and the identity; the kept list follows', async () => {
  const { actions, log } = makeActions();
  await actions.sendAsList({ chat: GROUP });
  const saved = await actions.sendAsSave({ chat: GROUP, sendAs: CHANNEL });
  assert.deepEqual(saved, { ok: true, current: CHANNEL });
  const request = log.at(-1);
  assert.equal(request.className, 'messages.SaveDefaultSendAs');
  assert.deepEqual(request.peer, { id: GROUP });
  // The channel Telegram named is an input peer with its access hash.
  assert.equal(request.sendAs.className, 'InputPeerChannel');
  assert.equal(request.sendAs.accessHash, 55n);
  assert.equal((await actions.sendAsList({ chat: GROUP })).current, CHANNEL);
});

test('save refuses bad input without asking', async () => {
  const { actions, log } = makeActions();
  for (const body of [
    { chat: '-5', sendAs: '42' },
    { chat: GROUP, sendAs: 'x' },
    { chat: GROUP },
  ]) {
    assert.equal((await actions.sendAsSave(body)).ok, false);
  }
  assert.equal(log.length, 0);
});

test("Telegram's refusals become codes", async () => {
  for (const [name, code] of [
    ['SEND_AS_PEER_INVALID', 'send-as-invalid'],
    ['PREMIUM_ACCOUNT_REQUIRED', 'premium'],
    ['CHAT_ADMIN_REQUIRED', 'no-rights'],
    ['CHANNEL_PRIVATE', 'no-access'],
  ]) {
    const { actions } = makeActions({
      fail: { 'messages.SaveDefaultSendAs': name },
    });
    const got = await actions.sendAsSave({ chat: GROUP, sendAs: '42' });
    assert.equal(got.ok, false);
    assert.equal(got.code, code);
  }
  const { actions } = makeActions({ fail: { 'channels.GetSendAs': 'X' } });
  assert.equal((await actions.sendAsList({ chat: GROUP })).code, 'failed');
});

test('withSendAs stamps the send requests only, not others, not set ones', async () => {
  const seen = [];
  const client = {
    invoke: async (request) => seen.push(request),
    getInputEntity: async () => 'the-input-peer',
    // GramJS's sendFile calls `this.invoke`: through the proxy it is ours.
    sendFile(peer, options) {
      return this.invoke(new Api.messages.SendMedia({ peer, ...options }));
    },
  };
  const env = { connection: { withPeer: (_c, _chat, use) => use('p') } };
  const as = await withSendAs(env, client, CHANNEL);
  await as.invoke(new Api.messages.SendMessage({}));
  await as.invoke(new Api.messages.SendMedia({}));
  await as.invoke(new Api.messages.SendMedia({ sendAs: 'mine' }));
  await as.invoke(new Api.channels.GetSendAs({}));
  await as.sendFile('p', { file: 1 });
  assert.deepEqual(
    seen.map((r) => r.sendAs),
    ['the-input-peer', 'the-input-peer', 'mine', undefined, 'the-input-peer']
  );
  assert.equal(await withSendAs(env, client, undefined), client);
  await assert.rejects(withSendAs(env, client, 'x y'), {
    errorMessage: 'SEND_AS_PEER_INVALID',
  });
});

test('text, long text in parts, and a lone die go as the chosen identity', async () => {
  const log = [];
  const client = {
    invoke: async (request) => {
      log.push(request);
      return { className: 'UpdateShortSentMessage', id: 5, date: 1 };
    },
    getInputEntity: async (peer) => peer,
  };
  const env = { connection: { withPeer: (_c, _chat, use) => use('p') } };
  const as = await withSendAs(env, client, '42');
  const Api2 = { ...Api, InputMediaDice: named('InputMediaDice') };
  await sendText({ client: as, Api: Api2, peer: 'p', text: 'hi' });
  await sendText({ client: as, Api: Api2, peer: 'p', text: '🎲' });
  await sendText({
    client: as,
    Api: Api2,
    peer: 'p',
    text: 'a'.repeat(30),
    maxLength: 10,
  });
  assert.equal(log.length, 5);
  assert.deepEqual(
    log.map((r) => r.className),
    [
      'messages.SendMessage',
      'messages.SendMedia',
      ...Array(3).fill('messages.SendMessage'),
    ]
  );
  for (const request of log) {
    assert.equal(request.sendAs, 'p');
  }
});

test('a sticker or GIF is sent as the chosen identity', async () => {
  const log = [];
  const doc = (id) => ({
    className: 'Document',
    id: BigInt(id),
    accessHash: BigInt(id * 10),
    fileReference: Buffer.from([id]),
    mimeType: 'image/webp',
    size: 1000,
    attributes: [{ className: 'DocumentAttributeSticker', alt: '🐱' }],
  });
  const client = {
    invoke: async (request) => {
      log.push(request);
      return request.className === 'GetStickerSet'
        ? {
            set: { id: -7n, accessHash: 70n, title: 'Cats', count: 1 },
            documents: [doc(2)],
          }
        : true;
    },
    getInputEntity: async () => 'input-as',
  };
  const stickers = createStickers(
    {
      importer: async () => ({
        Api: {
          ...Api,
          messages: {
            ...Api.messages,
            GetStickerSet: named('GetStickerSet'),
          },
          InputStickerSetID: named('InputStickerSetID'),
        },
        helpers,
      }),
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    },
    { userClient: async () => client, apply: async () => {}, mediaDir: null },
    { now: () => 0 }
  );
  await stickers.stickerSetBox({ id: '-7', accessHash: '70' });
  const sent = await stickers.sendDocument({
    chat: GROUP,
    id: '2',
    sendAs: CHANNEL,
  });
  assert.equal(sent.ok, true);
  assert.equal(log.at(-1).className, 'messages.SendMedia');
  assert.equal(log.at(-1).sendAs, 'input-as');
  await stickers.sendDocument({ chat: GROUP, id: '2', clientId: 'again' });
  assert.equal(log.at(-1).sendAs, undefined);
});

test('a poll is sent as the chosen identity', async () => {
  const asked = [];
  const client = {
    invoke: async (request) => {
      asked.push(request);
      return { className: 'Updates' };
    },
    getInputEntity: async () => 'input-as',
  };
  const actions = createPollActions(
    {
      store: createMemoryStore(),
      importer: async () => ({ Api, helpers }),
      connection: { withPeer: (_c, chat, use) => use({ peer: chat }) },
      queue: { run: (_key, _priority, task) => task() },
      actions: { scheduledChanged() {} },
    },
    { userClient: async () => client, apply: async () => {} }
  );
  const poll = {
    chat: GROUP,
    question: 'Lunch?',
    options: ['Soup', 'Salad'],
    anonymous: true,
    multiple: false,
    quiz: false,
    clientId: 'c1',
  };
  await actions.sendPoll({ ...poll, sendAs: CHANNEL });
  await actions.sendPoll({ ...poll, clientId: 'c2' });
  assert.equal(asked[0].sendAs, 'input-as');
  assert.equal(asked[1].sendAs, undefined);
  await assert.rejects(actions.sendPoll({ ...poll, sendAs: 'bad id' }), {
    code: 'send-as-invalid',
  });
});

test('routes validate sendAs on every send and the two new routes', async () => {
  const calls = [];
  const spy = (name) => async (body) => {
    calls.push([name, body]);
    return { ok: true };
  };
  const account = {
    sendFiles: spy('files'),
    sendVoice: spy('voice'),
    sendDocument: spy('doc'),
    sendPoll: spy('poll'),
    sendAsList: spy('list'),
    sendAsSave: spy('save'),
  };
  const poll = {
    chat: GROUP,
    question: 'Q?',
    options: ['a', 'b'],
    anonymous: true,
    multiple: false,
    quiz: false,
  };
  const token = 'a'.repeat(32);
  for (const [route, body] of [
    ['send-files', { chat: GROUP, tokens: [token] }],
    ['send-voice', { chat: GROUP, token, duration: 3 }],
    ['send-document', { chat: GROUP, id: '5' }],
    ['send-poll', poll],
  ]) {
    assert.equal(
      await postRoute(route, { ...body, sendAs: 'oops' }, account),
      400,
      route
    );
    assert.equal(
      await postRoute(route, { ...body, sendAs: CHANNEL }, account),
      200,
      route
    );
    assert.equal(calls.at(-1)[1].sendAs, CHANNEL, route);
    assert.equal(await postRoute(route, body, account), 200, route);
    assert.equal('sendAs' in calls.at(-1)[1], false, route);
  }
  assert.equal(await postRoute('send-as', { chat: '-5' }, account), 400);
  assert.equal(await postRoute('send-as', { chat: GROUP }, account), 200);
  assert.equal(
    await postRoute('send-as-save', { chat: GROUP, sendAs: 'x' }, account),
    400
  );
  assert.equal(
    await postRoute('send-as-save', { chat: GROUP, sendAs: '42' }, account),
    200
  );
  assert.deepEqual(calls.at(-1)[1], { chat: GROUP, sendAs: '42' });
});

test('send errors for a refused identity read as text', () => {
  const t = (key) => key;
  const invalid = sendError(telegramError('SEND_AS_PEER_INVALID'));
  assert.equal(invalid.code, 'send-as-invalid');
  assert.equal(failureText(t, invalid), 'chat.sendAs.err.send-as-invalid');
  const premium = sendError(telegramError('PREMIUM_ACCOUNT_REQUIRED'));
  assert.equal(premium.code, 'premium-required');
  assert.equal(failureText(t, premium), 'chat.sendAs.err.premium');
});

test("the page's helpers: supergroups only, nothing without a choice", () => {
  const api = { telegramSendAs() {} };
  const chat = (id, kind = 'group') => ({ source: 'telegram', chat: id, kind });
  assert.equal(canChooseSendAs(api, chat('-1001')), true);
  assert.equal(canChooseSendAs(api, chat('-1001', 'channel')), false);
  assert.equal(canChooseSendAs(api, chat('-5')), false);
  assert.equal(canChooseSendAs(api, chat('42', 'private')), false);
  assert.equal(canChooseSendAs({}, chat('-1001')), false);
  assert.deepEqual(sendAsField('-1001'), {});
});
