// Cloud drafts, the calendar's day counts and frequent contacts (R-Y207):
// the requests built, the stored drafts synced and emptied, the people
// listed, removed and turned off, the routes' strictness and the page's
// helpers. Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDrafts, draftsOf } from '../src/sources/telegram-drafts.js';
import { createCalendar, daysOf } from '../src/sources/telegram-calendar.js';
import { createTopPeers } from '../src/sources/telegram-top-peers.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { summarizeChats } from '../src/web/chat-model.js';
import {
  countsOf,
  monthKey,
  nextOffset,
  pageBefore,
} from '../src/web/chat-calendar.js';
import { named, postRoute } from './helpers/telegram-route.js';

const classes = [
  'messages.GetAllDrafts',
  'messages.ClearAllDrafts',
  'messages.GetSearchResultsCalendar',
  'contacts.GetTopPeers',
  'contacts.ResetTopPeerRating',
  'contacts.ToggleTopPeers',
];
const Api = {
  InputMessagesFilterEmpty: named('InputMessagesFilterEmpty'),
  InputMessagesFilterPhotos: named('InputMessagesFilterPhotos'),
  InputMessagesFilterVideo: named('InputMessagesFilterVideo'),
  InputMessagesFilterPhotoVideo: named('InputMessagesFilterPhotoVideo'),
  InputMessagesFilterDocument: named('InputMessagesFilterDocument'),
  InputMessagesFilterUrl: named('InputMessagesFilterUrl'),
  InputMessagesFilterMusic: named('InputMessagesFilterMusic'),
  InputMessagesFilterVoice: named('InputMessagesFilterVoice'),
  TopPeerCategoryCorrespondents: named('TopPeerCategoryCorrespondents'),
};
for (const path of classes) {
  const [ns, cls] = path.split('.');
  Api[ns] ??= {};
  Api[ns][cls] = named(cls);
}
const helpers = { returnBigInt: (v) => BigInt(v) };
const utils = { getPeerId: (peer) => String(peer.userId ?? peer.id) };

const telegramError = (errorMessage) =>
  Object.assign(new Error(errorMessage), { errorMessage });

const make = (answer, { store = createMemoryStore() } = {}) => {
  const log = [];
  const drafted = [];
  const remembered = [];
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
  const env = {
    importer: async () => ({ Api, helpers, utils }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    peers: { remember: (...args) => remembered.push(args) },
    store,
    live: { draft: async (effect) => drafted.push(effect) },
  };
  const context = { userClient: async () => client };
  return {
    log,
    drafted,
    remembered,
    store,
    drafts: createDrafts(env, context),
    calendar: createCalendar(env, context),
    top: createTopPeers(env, context),
  };
};

const draftUpdate = (userId, message, date = 100) => ({
  className: 'UpdateDraftMessage',
  peer: { userId: BigInt(userId) },
  draft:
    message === null ? { className: 'DraftMessageEmpty' } : { message, date },
});

const readLink = (chat, draft) => ({
  id: `read:telegram:${chat}`,
  source: 'telegram',
  chat,
  draft,
});

test('draftsOf: the updates of getAllDrafts as effects, others left out', () => {
  const found = draftsOf({
    className: 'Updates',
    updates: [
      draftUpdate(7, 'hello'),
      { className: 'UpdateNewMessage' },
      draftUpdate(8, null),
    ],
  });
  assert.deepEqual(
    found.map((d) => [d.chat, d.text]),
    [
      ['7', 'hello'],
      ['8', ''],
    ]
  );
});

test('syncDrafts: stores the listed drafts, empties those cleared elsewhere', async () => {
  const store = createMemoryStore();
  await store.put(readLink('7', 'old'));
  await store.put(readLink('9', 'gone elsewhere'));
  await store.put(readLink('10', ''));
  const t = make(
    () => ({ className: 'Updates', updates: [draftUpdate(7, 'from phone')] }),
    { store }
  );
  const answer = await t.drafts.syncDrafts();
  assert.deepEqual(answer, { ok: true, drafts: 1, cleared: 1 });
  assert.equal(t.log[0].className, 'GetAllDrafts');
  assert.deepEqual(
    t.drafted.map((d) => [d.chat, d.text]),
    [
      ['7', 'from phone'],
      ['9', ''],
    ]
  );
});

test('syncDrafts: a flood wait becomes a code, nothing is touched', async () => {
  const t = make(() => telegramError('FLOOD_WAIT_9'));
  const answer = await t.drafts.syncDrafts();
  assert.equal(answer.ok, false);
  assert.equal(answer.code, 'flood');
  assert.equal(t.drafted.length, 0);
});

test('clearAllDrafts: asks Telegram, then empties every stored draft', async () => {
  const store = createMemoryStore();
  await store.put(readLink('7', 'a'));
  await store.put(readLink('8', 'b'));
  await store.put(readLink('9', ''));
  const t = make(() => true, { store });
  assert.deepEqual(await t.drafts.clearAllDrafts(), { ok: true, cleared: 2 });
  assert.equal(t.log[0].className, 'ClearAllDrafts');
  assert.deepEqual(
    t.drafted.map((d) => d.text),
    ['', '']
  );
});

test('calendar: the filter, the offset date and the days answered', async () => {
  const t = make(() => ({
    minDate: 1000,
    count: 5,
    inexact: false,
    periods: [
      { date: 2000, minMsgId: 4, maxMsgId: 5, count: 2 },
      { date: 1000, minMsgId: 1, maxMsgId: 3, count: 3 },
    ],
  }));
  const answer = await t.calendar.calendar({
    chat: '55',
    filter: 'photoVideo',
    before: 3000,
  });
  const request = t.log[0];
  assert.equal(request.className, 'GetSearchResultsCalendar');
  assert.equal(request.filter.className, 'InputMessagesFilterPhotoVideo');
  assert.equal(request.offsetDate, 3000);
  assert.equal(request.offsetId, 0);
  assert.deepEqual(answer, {
    ok: true,
    days: [
      { date: 2000, count: 2, minId: 4, maxId: 5 },
      { date: 1000, count: 3, minId: 1, maxId: 3 },
    ],
    first: 1000,
    total: 5,
    inexact: false,
  });
  assert.equal(daysOf(null).length, 0);
});

test('calendar: every message by default; a bad filter asks nothing', async () => {
  const t = make(() => ({ periods: [] }));
  await t.calendar.calendar({ chat: '55' });
  assert.equal(t.log[0].filter.className, 'InputMessagesFilterEmpty');
  assert.equal(t.log[0].offsetDate, 0);
  const bad = await t.calendar.calendar({ chat: '55', filter: 'nope' });
  assert.equal(bad.code, 'bad-request');
  assert.equal(t.log.length, 1);
});

const person = (id, firstName, extra = {}) => ({
  className: 'User',
  id: BigInt(id),
  firstName,
  accessHash: 9n,
  ...extra,
});

test('topPeers: the correspondents in order, no yourself, remembered', async () => {
  const t = make(() => ({
    className: 'contacts.TopPeers',
    categories: [
      {
        category: { className: 'TopPeerCategoryBotsPM' },
        peers: [{ peer: { userId: 3n } }],
      },
      {
        category: { className: 'TopPeerCategoryCorrespondents' },
        peers: [
          { peer: { userId: 2n } },
          { peer: { userId: 1n } },
          { peer: { userId: 4n } },
        ],
      },
    ],
    users: [
      person(1, 'Ann', { username: 'ann' }),
      person(2, 'Bob'),
      person(3, 'Bot', { bot: true }),
      person(4, 'Me', { self: true }),
    ],
    chats: [],
  }));
  const answer = await t.top.topPeers();
  assert.equal(t.log[0].correspondents, true);
  assert.equal(t.log[0].limit, 10);
  assert.equal(answer.enabled, true);
  assert.deepEqual(
    answer.peers.map((p) => [p.chat, p.name, p.username, p.kind]),
    [
      ['2', 'Bob', null, 'user'],
      ['1', 'Ann', 'ann', 'user'],
    ]
  );
  assert.equal(t.remembered.length, 2);
});

test('topPeers: turned off, nothing is listed', async () => {
  const t = make(() => ({ className: 'contacts.TopPeersDisabled' }));
  assert.deepEqual(await t.top.topPeers(), {
    ok: true,
    enabled: false,
    peers: [],
  });
});

test('removeTopPeer and setTopPeers: the requests, strict input', async () => {
  const t = make(() => true);
  assert.deepEqual(await t.top.removeTopPeer({ chat: '12' }), { ok: true });
  assert.equal(t.log[0].className, 'ResetTopPeerRating');
  assert.equal(t.log[0].category.className, 'TopPeerCategoryCorrespondents');
  assert.equal(t.log[0].peer.chat, '12');
  assert.equal((await t.top.removeTopPeer({ chat: 'x' })).code, 'bad-request');
  assert.deepEqual(await t.top.setTopPeers({ enabled: false }), {
    ok: true,
    enabled: false,
  });
  assert.equal(t.log[1].className, 'ToggleTopPeers');
  assert.equal(t.log[1].enabled, false);
  assert.equal(
    (await t.top.setTopPeers({ enabled: 'no' })).code,
    'bad-request'
  );
  assert.equal(t.log.length, 2);
});

test('routes: strict bodies reach the account only when valid', async () => {
  const called = [];
  const account = {
    syncDrafts: async () => called.push('sync') && { ok: true },
    clearAllDrafts: async () => called.push('clear') && { ok: true },
    calendar: async (b) => called.push(['calendar', b]) && { ok: true },
    topPeers: async () => called.push('top') && { ok: true },
    removeTopPeer: async (b) => called.push(['remove', b]) && { ok: true },
    setTopPeers: async (b) => called.push(['toggle', b]) && { ok: true },
  };
  assert.equal(await postRoute('drafts-sync', {}, account), 200);
  assert.equal(await postRoute('drafts-clear', {}, account), 200);
  assert.equal(await postRoute('top-peers', {}, account), 200);
  assert.equal(
    await postRoute('calendar', { chat: '5', before: 7 }, account),
    200
  );
  assert.equal(
    await postRoute('calendar', { chat: '5', filter: 'x' }, account),
    400
  );
  assert.equal(
    await postRoute('calendar', { chat: '5', before: -1 }, account),
    400
  );
  assert.equal(await postRoute('calendar', { chat: 'a' }, account), 400);
  assert.equal(
    await postRoute('top-peers-remove', { chat: '5' }, account),
    200
  );
  assert.equal(await postRoute('top-peers-remove', {}, account), 400);
  assert.equal(
    await postRoute('top-peers-toggle', { enabled: true }, account),
    200
  );
  assert.equal(
    await postRoute('top-peers-toggle', { enabled: 1 }, account),
    400
  );
  assert.equal(await postRoute('drafts-sync', {}, {}), 400);
  assert.deepEqual(called[3], ['calendar', { chat: '5', before: 7 }]);
});

test('the calendar helpers: offset dates, counts, paging', () => {
  const NOW = new Date(2025, 5, 15, 12).getTime();
  assert.equal(monthKey(2025, 0), '2025-01');
  assert.equal(pageBefore(2025, 5, NOW), 0);
  assert.equal(pageBefore(2025, 2, NOW), new Date(2025, 3, 1).getTime() / 1000);
  const day = (y, m, d, count) => ({
    date: new Date(y, m, d).getTime() / 1000,
    count,
  });
  const counts = countsOf([day(2025, 2, 4, 3), day(2025, 2, 9, 1)]);
  assert.equal(counts.get('2025-03-04'), 3);
  assert.equal(counts.get('2025-03-09'), 1);
  // The oldest day of the page is inside the month: more is asked.
  const answer = {
    days: [day(2025, 2, 20, 1), day(2025, 2, 10, 1)],
    first: null,
  };
  assert.equal(nextOffset(answer, 2025, 2), day(2025, 2, 10, 1).date);
  // Reaching the month's start, or the chat's first message, is done.
  assert.equal(
    nextOffset({ days: [day(2025, 1, 25, 1)], first: null }, 2025, 2),
    null
  );
  assert.equal(
    nextOffset(
      { days: [day(2025, 2, 10, 1)], first: day(2025, 2, 10, 1).date + 60 },
      2025,
      2
    ),
    null
  );
  assert.equal(nextOffset({ days: [] }, 2025, 2), null);
});

test('the chat list: a draft with text shows, an empty one does not', () => {
  const message = (chat) => ({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: `Chat ${chat}`,
    chatType: 'personal_chat',
    sender: chat,
    body: 'hi',
    timestamp: '2025-01-01T10:00:00.000Z',
    raw: { id: 1 },
  });
  const links = [
    message('1'),
    message('2'),
    message('3'),
    readLink('1', 'unsent words'),
    readLink('2', '   '),
  ];
  const chats = summarizeChats(links);
  const by = (chat) => chats.find((c) => c.chat === chat);
  assert.equal(by('1').draft, 'unsent words');
  assert.equal(by('2').draft, undefined);
  assert.equal(by('3').draft, undefined);
});
