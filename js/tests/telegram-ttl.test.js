// A chat's auto-delete timer and Saved Messages by chat (R-Y143): the
// allowed periods, the period read from the full info, who may set it,
// the saved dialogs' shape and paging, the saved history, deleting it,
// the routes' validation and the page's pure helpers. Fake clients;
// nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTtl, TTL_PERIODS } from '../src/sources/telegram-ttl.js';
import {
  canSetTtlIn,
  createChatInfoReader,
} from '../src/sources/telegram-chat-info.js';
import { parseMessageParts } from '../src/web/message-parts.js';
import {
  hasTtl,
  periodOf,
  periodShort,
  periodWords,
} from '../src/web/chat-ttl.js';
import { isSavedChat } from '../src/web/chat-saved.js';
import {
  fakeClient,
  helpers,
  named,
  post,
  telegramError,
} from './helpers/telegram-fakes.mjs';

const Api = {
  messages: {
    SetHistoryTTL: named('SetHistoryTTL'),
    GetSavedDialogs: named('GetSavedDialogs'),
    GetSavedHistory: named('GetSavedHistory'),
    DeleteSavedHistory: named('DeleteSavedHistory'),
    GetFullChat: named('GetFullChat'),
    GetOnlines: named('GetOnlines'),
  },
  channels: { GetFullChannel: named('GetFullChannel') },
  users: { GetFullUser: named('GetFullUser') },
  InputPeerEmpty: named('InputPeerEmpty'),
  InputUser: named('InputUser'),
};

const make = (answer, extra = {}) => {
  const log = [];
  const applied = [];
  const env = {
    importer: async () => ({ Api, helpers }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
  };
  const client = fakeClient(answer, log);
  const actions = createTtl(env, {
    userClient: async () => client,
    tools: {
      toLinks: (dialog, messages) =>
        messages.map((m) => ({
          id: `msg:telegram:${dialog.id}:${m.id}`,
          body: m.message,
        })),
    },
    apply: async (_c, result) => applied.push(result),
    ...extra,
  });
  return { ...actions, log, applied };
};

test('the allowed periods: off, a day, a week, a month and the longer ones', () => {
  assert.deepEqual(TTL_PERIODS.slice(0, 4), [0, 86400, 604800, 2678400]);
  assert.equal(TTL_PERIODS.includes(3600), false, 'an hour is not accepted');
});

test('setHistoryTtl: sends the period for the chat and applies the updates', async () => {
  const { setHistoryTtl, log, applied } = make(() => ({
    className: 'Updates',
  }));
  assert.deepEqual(await setHistoryTtl({ chat: '-1005', period: 604800 }), {
    ok: true,
    period: 604800,
  });
  assert.equal(log[0].className, 'SetHistoryTTL');
  assert.equal(log[0].period, 604800);
  assert.deepEqual(log[0].peer, { chat: '-1005' });
  assert.equal(applied.length, 1);
  assert.equal((await setHistoryTtl({ chat: '7', period: 0 })).ok, true, 'off');
});

test('setHistoryTtl: a period Telegram does not list, or a bad chat, is refused unasked', async () => {
  const { setHistoryTtl, log } = make(() => ({}));
  for (const period of [3600, 1, -1, '604800', null, undefined]) {
    const got = await setHistoryTtl({ chat: '7', period });
    assert.equal(got.ok, false, `period ${period}`);
    assert.equal(got.code, 'failed');
  }
  assert.equal((await setHistoryTtl({ chat: 'x', period: 0 })).ok, false);
  assert.equal(log.length, 0, 'nothing reached Telegram');
});

test("setHistoryTtl: Telegram's errors become codes", async () => {
  const codes = {
    TTL_PERIOD_INVALID: 'bad-period',
    CHAT_ADMIN_REQUIRED: 'not-admin',
    PEER_ID_INVALID: 'no-access',
    SOMETHING_ELSE: 'failed',
  };
  for (const [name, code] of Object.entries(codes)) {
    const { setHistoryTtl } = make(() => telegramError(name));
    const got = await setHistoryTtl({ chat: '7', period: 86400 });
    assert.equal(got.ok, false);
    assert.equal(got.code, code, name);
  }
});

test('setHistoryTtl: without a connected account nothing is supported', async () => {
  const env = { importer: async () => ({ Api, helpers }) };
  const { setHistoryTtl } = createTtl(env, {
    userClient: async () => null,
    tools: {},
  });
  assert.deepEqual(await setHistoryTtl({ chat: '7', period: 0 }), {
    ok: false,
    supported: false,
  });
});

test('canSetTtl: a creator, or an admin who may delete messages', () => {
  assert.equal(canSetTtlIn({ creator: true }), true);
  assert.equal(canSetTtlIn({ adminRights: { deleteMessages: true } }), true);
  assert.equal(canSetTtlIn({ adminRights: { pinMessages: true } }), false);
  assert.equal(canSetTtlIn({}), false);
  assert.equal(canSetTtlIn(), false);
});

const readerOver = (invoke, input) =>
  createChatInfoReader({
    queue: { run: async (_k, _p, fn) => fn() },
    client: async () => ({ invoke }),
    peers: { input: async () => input },
    importer: async () => ({ Api, helpers }),
  });

test('the period and who may set it are read from the full info', async () => {
  const channel = readerOver(
    async (r) =>
      r.className === 'GetFullChannel'
        ? {
            fullChat: { participantsCount: 5, ttlPeriod: 604800 },
            chats: [
              {
                title: 'G',
                megagroup: true,
                adminRights: { deleteMessages: true },
              },
            ],
          }
        : { onlines: 1 },
    { className: 'InputPeerChannel' }
  );
  const got = await channel.read({ chat: '-1001' });
  assert.equal(got.ttlPeriod, 604800);
  assert.equal(got.canSetTtl, true);

  const plain = readerOver(
    async (r) =>
      r.className === 'GetFullChannel'
        ? {
            fullChat: { participantsCount: 5 },
            chats: [{ title: 'G', megagroup: true }],
          }
        : { onlines: 1 },
    { className: 'InputPeerChannel' }
  );
  const member = await plain.read({ chat: '-1002' });
  assert.equal(member.ttlPeriod, 0);
  assert.equal(member.canSetTtl, false);

  const person = readerOver(
    async () => ({
      fullUser: { ttlPeriod: 86400 },
      users: [{ firstName: 'Ann', self: false }],
    }),
    { userId: 5n, accessHash: 1n }
  );
  const ann = await person.read({ chat: '5' });
  assert.equal(ann.ttlPeriod, 86400);
  assert.equal(ann.canSetTtl, true);
  assert.equal(ann.self, undefined);

  const own = readerOver(
    async () => ({ fullUser: {}, users: [{ firstName: 'Me', self: true }] }),
    { userId: 6n, accessHash: 1n }
  );
  const saved = await own.read({ chat: '6' });
  assert.equal(saved.self, true, 'Saved Messages is told apart');
  assert.equal(saved.canSetTtl, false, 'no timer in Saved Messages');
});

// A saved dialog as Telegram answers it.
const dialogOf = (user, top, extra = {}) => ({
  peer: { userId: BigInt(user) },
  topMessage: top,
  ...extra,
});
const savedAnswer = (dialogs, messages, users, chats = []) => ({
  className: 'messages.SavedDialogsSlice',
  dialogs,
  messages,
  users,
  chats,
});

test('savedDialogs: avatar peers, names, previews and dates, with a cursor', async () => {
  const { savedDialogs, log } = make(() =>
    savedAnswer(
      [
        dialogOf(5, 11, { pinned: true }),
        { peer: { channelId: 9n }, topMessage: 10 },
        { peer: { chatId: 4n }, topMessage: 9 },
      ],
      [
        { id: 11, date: 1_700_000_100, message: 'hello' },
        {
          id: 10,
          date: 1_700_000_000,
          message: '',
          media: { className: 'MessageMediaPhoto' },
        },
        { id: 9, date: 1_699_999_000, message: 'old' },
      ],
      [{ id: 5n, firstName: 'Ann', lastName: 'Lee' }],
      [
        { id: 9n, title: 'News' },
        { id: 4n, title: 'Family' },
      ]
    )
  );
  const got = await savedDialogs({ limit: 3 });
  assert.equal(got.ok, true);
  assert.equal(log[0].className, 'GetSavedDialogs');
  assert.equal(log[0].offsetPeer.className, 'InputPeerEmpty');
  assert.equal(
    log[0].excludePinned,
    undefined,
    'the first page has the pinned'
  );
  assert.deepEqual(
    got.dialogs.map((d) => [
      d.peer,
      d.kind,
      d.name,
      d.preview,
      d.media,
      d.pinned,
    ]),
    [
      ['5', 'user', 'Ann Lee', 'hello', null, true],
      ['-1009', 'channel', 'News', '', 'photo', false],
      ['-4', 'group', 'Family', 'old', null, false],
    ]
  );
  assert.equal(got.dialogs[0].date, 1_700_000_100_000);
  assert.equal(got.complete, false);
  assert.deepEqual(got.next, {
    offsetDate: 1_699_999_000,
    offsetId: 9,
    offsetPeer: '-4',
  });
});

test('savedDialogs: the next page asks from the cursor and ends when short', async () => {
  const { savedDialogs, log } = make(() =>
    savedAnswer(
      [dialogOf(5, 3)],
      [{ id: 3, date: 100, message: 'x' }],
      [{ id: 5n, firstName: 'Ann' }]
    )
  );
  const got = await savedDialogs({
    offsetDate: 1_699_999_000,
    offsetId: 9,
    offsetPeer: '-4',
    limit: 30,
  });
  assert.equal(log[0].offsetDate, 1_699_999_000);
  assert.equal(log[0].offsetId, 9);
  assert.deepEqual(log[0].offsetPeer, { chat: '-4' });
  assert.equal(log[0].excludePinned, true, 'pinned ones are not repeated');
  assert.equal(got.complete, true);
  assert.equal(got.next, null);
});

test('savedDialogs: nothing changed is an empty list; bad paging is refused unasked', async () => {
  const empty = make(() => ({
    className: 'messages.SavedDialogsNotModified',
    count: 0,
  }));
  assert.deepEqual(await empty.savedDialogs({}), {
    ok: true,
    dialogs: [],
    complete: true,
    next: null,
  });
  for (const bad of [
    { limit: 0 },
    { limit: 101 },
    { offsetId: -1 },
    { offsetPeer: 'x' },
    { offsetDate: 1.5 },
  ]) {
    assert.equal(
      (await empty.savedDialogs(bad)).ok,
      false,
      JSON.stringify(bad)
    );
  }
  assert.equal(empty.log.length, 1);
});

test('savedHistory: oldest first, as links of the Saved Messages chat, paged by id', async () => {
  const { savedHistory, log } = make(() => ({
    messages: [
      { id: 8, message: 'b' },
      { id: 7, message: 'a' },
      { id: 6, className: 'MessageEmpty' },
    ],
  }));
  const got = await savedHistory({ chat: '1', peer: '5', limit: 5 });
  assert.equal(got.ok, true);
  assert.deepEqual(
    got.messages.map((m) => m.id),
    ['msg:telegram:1:7', 'msg:telegram:1:8']
  );
  assert.equal(got.complete, true);
  assert.equal(log[0].className, 'GetSavedHistory');
  assert.deepEqual(log[0].peer, { chat: '5' });
  assert.equal(log[0].offsetId, 0);
  await savedHistory({ chat: '1', peer: '-4', before: 7, limit: 2 });
  assert.equal(log[1].offsetId, 7);
  assert.equal(log[1].limit, 2);
  for (const bad of [
    { chat: '-1', peer: '5' },
    { chat: '1', peer: 'x' },
    { chat: '1', peer: '5', before: 0 },
    { chat: '1', peer: '5', limit: 500 },
  ]) {
    assert.equal((await savedHistory(bad)).ok, false, JSON.stringify(bad));
  }
  assert.equal(log.length, 2);
});

test('savedDelete: repeats while Telegram has more, then is done; errors are codes', async () => {
  let left = 2;
  const { savedDelete, log } = make(() => ({ offset: left-- > 0 ? 100 : 0 }));
  assert.deepEqual(await savedDelete({ peer: '5' }), { ok: true });
  assert.equal(log.length, 3);
  assert.equal(log[0].className, 'DeleteSavedHistory');
  assert.equal(log[0].maxId, 0);
  assert.equal((await savedDelete({ peer: 'x' })).ok, false);
  const failing = make(() => telegramError('PEER_ID_INVALID'));
  assert.equal((await failing.savedDelete({ peer: '5' })).code, 'no-access');
});

test('the routes check their bodies before asking the account', async () => {
  const calls = [];
  const account = {
    setHistoryTtl: async (r) => (calls.push(['ttl', r]), { ok: true }),
    savedDialogs: async (r) => (calls.push(['dialogs', r]), { ok: true }),
    savedHistory: async (r) => (calls.push(['history', r]), { ok: true }),
    savedDelete: async (r) => (calls.push(['delete', r]), { ok: true }),
  };
  const status = async (route, body) =>
    (await post(route, body, account)).status;
  assert.equal(
    await status('history-ttl', { chat: '-1005', period: 604800 }),
    200
  );
  assert.equal(
    await status('history-ttl', { chat: '-1005', period: 3600 }),
    400
  );
  assert.equal(await status('history-ttl', { chat: 'x', period: 0 }), 400);
  assert.equal(await status('history-ttl', { period: 0 }), 400);
  assert.equal(await status('saved-dialogs', {}), 200);
  assert.equal(
    await status('saved-dialogs', {
      offsetDate: 5,
      offsetId: 6,
      offsetPeer: '-4',
      limit: 30,
    }),
    200
  );
  assert.equal(await status('saved-dialogs', { limit: 1000 }), 400);
  assert.equal(await status('saved-dialogs', { offsetPeer: 'x' }), 400);
  assert.equal(await status('saved-history', { chat: '1', peer: '5' }), 200);
  assert.equal(await status('saved-history', { chat: '1' }), 400);
  assert.equal(
    await status('saved-history', { chat: '1', peer: '5', before: -2 }),
    400
  );
  assert.equal(await status('saved-delete', { peer: '-4' }), 200);
  assert.equal(await status('saved-delete', {}), 400);
  assert.equal(calls.length, 5, 'only the valid ones were asked');
  assert.equal(
    (await post('history-ttl', { chat: '7', period: 0 }, {})).status,
    400
  );
});

test('the page: who sees the item, which period shows, how it is worded', () => {
  const chat = { source: 'telegram', chat: '-1005' };
  assert.equal(hasTtl(chat, { canSetTtl: true }), true);
  assert.equal(hasTtl(chat, { canSetTtl: false }), false);
  assert.equal(hasTtl(chat, null), false);
  assert.equal(hasTtl({ source: 'x', chat: '1' }, { canSetTtl: true }), false);

  assert.equal(periodOf('-9001', { ttlPeriod: 86400 }), 86400, 'from the info');
  assert.equal(periodOf('-9001', {}), 0);
  assert.equal(periodOf('-9001', null), 0);

  const t = (key, v) => `${key}${v ? JSON.stringify(v) : ''}`;
  assert.equal(periodWords(t, 0), 'chat.ttl.off');
  assert.equal(periodWords(t, 604800), 'chat.ttl.week');
  assert.equal(periodShort(t, 2_678_400), 'chat.ttl.short.month');
  assert.equal(periodWords(t, 172_800), 'chat.ttl.days{"count":2}');

  assert.equal(isSavedChat({ source: 'telegram' }, { self: true }), true);
  assert.equal(isSavedChat({ source: 'telegram' }, { self: false }), false);
  assert.equal(isSavedChat({ source: 'telegram' }, null), false);
});

test('a message with a timer carries it to its parts', () => {
  assert.equal(
    parseMessageParts({ body: 'x', raw: { ttlPeriod: 86400 } }).ttl,
    86400
  );
  assert.equal(parseMessageParts({ body: 'x', raw: {} }).ttl, 0);
});
