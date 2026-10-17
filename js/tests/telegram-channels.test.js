// Asking Telegram little and in step (R-Y34, R-Y35): chats are read by
// their stored peer, a channel's missed updates (deletions too) come from
// its own difference instead of a re-read of the chat list, and a refused
// address book is not asked for again on every sync. Fakes only —
// nothing here touches the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore } from '../src/storage/universal.js';
import { NO_PACE } from '../src/sources/telegram-history.js';
import { createPeers, peerRecord } from '../src/sources/telegram-peers.js';
import {
  channelStateId,
  channelStep,
  createChannelSync,
} from '../src/sources/telegram-channels.js';
import { createTelegramAccount } from '../src/sources/telegram-account.js';

// GramJS's classes, as far as these tests need them: each request keeps
// what it was built with and its TL name.
const tl = (className) =>
  class {
    constructor(args = {}) {
      Object.assign(this, args, { className });
    }
  };
const fakeTelegram = () => ({
  Api: {
    InputPeerUser: tl('InputPeerUser'),
    InputPeerChat: tl('InputPeerChat'),
    InputPeerChannel: tl('InputPeerChannel'),
    ChannelMessagesFilterEmpty: tl('ChannelMessagesFilterEmpty'),
    updates: {
      GetState: tl('updates.GetState'),
      GetDifference: tl('updates.GetDifference'),
      GetChannelDifference: tl('updates.GetChannelDifference'),
    },
  },
  helpers: { returnBigInt: (value) => `big:${value}` },
});
const importer = async () => fakeTelegram();

test('a chat’s input peer is stored once and rebuilt without asking', async () => {
  assert.equal(peerRecord({ className: 'User', id: 1, min: true }), null);
  assert.deepEqual(
    peerRecord({ className: 'InputPeerChannel', channelId: 5, accessHash: 9 }),
    { kind: 'channel', peerId: '5', accessHash: '9' }
  );
  const store = createMemoryStore();
  let puts = 0;
  const counted = { ...store, put: (link) => ((puts += 1), store.put(link)) };
  const peers = createPeers({ store: counted, importer });
  const input = { className: 'InputPeerUser', userId: 42, accessHash: 7 };
  const dialog = { title: 'Alice', isUser: true };
  assert.equal(await peers.remember('42', input, dialog), true);
  assert.equal(await peers.remember('42', input, dialog), false);
  assert.equal(puts, 1, 'an unchanged peer is not written again');
  const again = createPeers({ store, importer });
  assert.deepEqual(
    { ...(await again.input('42')) },
    {
      userId: 'big:42',
      accessHash: 'big:7',
      className: 'InputPeerUser',
    }
  );
  assert.equal((await again.dialog('42')).title, 'Alice');
  assert.equal(await again.input('7'), null);
});

test('channel updates move the channel’s own number', () => {
  assert.deepEqual(
    channelStep({
      className: 'UpdateDeleteChannelMessages',
      channelId: 5,
      messages: [1],
      pts: 12,
      ptsCount: 1,
    }),
    { chat: '-1005', pts: 12, count: 1 }
  );
  assert.deepEqual(
    channelStep({ className: 'UpdateChannelTooLong', channelId: 5 }),
    { chat: '-1005', tooLong: true }
  );
  assert.equal(channelStep({ className: 'UpdateNewMessage', pts: 3 }), null);
});

const channelSync = (store, { invoke, now = () => 0, isGroup = true }) => {
  const handled = [];
  const requests = [];
  const sync = createChannelSync({
    store,
    peers: {
      input: async () => ({ className: 'InputPeerChannel' }),
      dialog: async () => ({ isGroup }),
    },
    request: (key, priority, task) => {
      requests.push({ key, priority });
      return task();
    },
    handle: async (_client, update) => handled.push(update),
    client: async () => ({ invoke }),
    importer,
    now,
  });
  return { sync, handled, requests };
};

test('a channel’s gap is caught up from its number, once a minute (R-Y35)', async () => {
  const store = createMemoryStore();
  let clock = 0;
  const asked = [];
  const { sync, handled, requests } = channelSync(store, {
    now: () => clock,
    invoke: async (request) => {
      asked.push(request.pts);
      return {
        className: 'updates.ChannelDifference',
        pts: 15,
        final: true,
        newMessages: [{ id: 30, message: 'new', peerId: { channelId: 5 } }],
        otherUpdates: [
          {
            className: 'UpdateDeleteChannelMessages',
            channelId: 5,
            messages: [20],
          },
        ],
        users: [],
        chats: [],
      };
    },
  });
  await sync.seed('-1005', 10);
  await sync.seed('-1005', 99); // a later listing does not skip ahead
  // In step: the number moves, nothing is asked.
  await sync.observe({
    className: 'UpdateEditChannelMessage',
    message: { id: 3, peerId: { channelId: 5 } },
    pts: 11,
    ptsCount: 1,
  });
  assert.equal(asked.length, 0);
  clock = 61_000;
  await sync.observe({ className: 'UpdateChannelTooLong', channelId: 5 });
  assert.deepEqual(asked, [11]);
  assert.deepEqual(
    handled.map((u) => u.className),
    ['UpdateNewChannelMessage', 'UpdateDeleteChannelMessages']
  );
  assert.equal(requests[0].priority, 'prefetch');
  assert.match(requests[0].key, /^channel:-1005:/);
  // Again within the minute: not asked.
  await sync.observe({ className: 'UpdateChannelTooLong', channelId: 5 });
  assert.equal(asked.length, 1);
  await sync.flush();
  assert.equal((await store.get(channelStateId('-1005'))).pts, 15);
  // The stretch of the chat that is stored grew with it.
  assert.equal((await store.get('history:telegram:-1005')).newest, 30);
});

test('a broadcast channel is caught up only while it is read', async () => {
  const store = createMemoryStore();
  const asked = [];
  const { sync } = channelSync(store, {
    isGroup: false,
    now: () => 100_000,
    invoke: async (request) => {
      asked.push(request.pts);
      return { className: 'updates.ChannelDifferenceEmpty', pts: 4 };
    },
  });
  await sync.seed('-1007', 4);
  await sync.observe({ className: 'UpdateChannelTooLong', channelId: 7 });
  assert.equal(asked.length, 0);
  sync.opened('-1007');
  await sync.observe({ className: 'UpdateChannelTooLong', channelId: 7 });
  assert.equal(asked.length, 1);
});

// ---- the account ---------------------------------------------------------

const seed = async (store) => {
  const put = (name, value) =>
    store.put({ id: `secret:telegram:${name}`, tokens: [], value });
  await put('user-session', 'fake-session');
  await put('api-id', '1');
  await put('api-hash', 'h');
};

const GROUP = {
  id: -1005,
  title: 'Group',
  isUser: false,
  isGroup: true,
  isChannel: true,
  entity: { className: 'Channel', id: 5, title: 'Group', megagroup: true },
  inputEntity: { className: 'InputPeerChannel', channelId: 5, accessHash: 9 },
  dialog: { pts: 10 },
  message: { id: 20, message: 'hello', date: 1_700_000_000 },
};

const groupClient = (calls) => {
  const handlers = [];
  return {
    handlers,
    setLogLevel() {},
    async connect() {},
    async disconnect() {},
    async getMe() {
      return { id: 1, self: true };
    },
    async getDialogs() {
      calls.push('getDialogs');
      return [GROUP];
    },
    async getMessages(peer, { offsetId = 0, limit } = {}) {
      calls.push(`getMessages:${peer?.className}`);
      const last = { ...GROUP.message, peerId: { channelId: 5 } };
      return offsetId ? [] : [last].slice(0, limit);
    },
    async getEntity() {
      calls.push('getEntity');
      throw new Error('Could not find the input entity');
    },
    async getContacts() {
      calls.push('getContacts');
      throw Object.assign(new Error('A wait of 300 seconds is required'), {
        seconds: 300,
      });
    },
    addEventHandler(handler) {
      handlers.push(handler);
    },
    async invoke(request) {
      calls.push(request.className);
      if (request.className === 'updates.GetState') {
        return { pts: 1, qts: 0, date: 0, seq: 0 };
      }
      if (request.className === 'updates.GetChannelDifference') {
        return {
          className: 'updates.ChannelDifference',
          pts: 11,
          final: true,
          newMessages: [],
          otherUpdates: [
            {
              className: 'UpdateDeleteChannelMessages',
              channelId: 5,
              messages: [20],
              pts: 11,
              ptsCount: 1,
            },
          ],
          users: [],
          chats: [],
        };
      }
      return { className: 'updates.DifferenceEmpty', date: 0, seq: 0 };
    },
  };
};

test('a deletion Telegram did not push arrives with the group’s catch-up (R-Y35)', async () => {
  const store = createMemoryStore();
  await seed(store);
  const calls = [];
  const client = groupClient(calls);
  let clock = 1_000_000;
  const account = createTelegramAccount({
    pace: NO_PACE,
    store,
    importer,
    now: () => clock,
    clientFactory: async () => client,
    pollMs: 0,
    backfillMs: 0,
  });
  await account.sync({ full: true });
  assert.equal((await store.get('msg:telegram:-1005:20')).body, 'hello');
  assert.equal((await store.get('peer:telegram:-1005')).kind, 'channel');
  // Telegram sends "too long" instead of the deletion.
  clock += 120_000;
  for (const handler of client.handlers) {
    await handler({ className: 'UpdateChannelTooLong', channelId: 5 });
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal((await store.get('msg:telegram:-1005:20')).deleted, true);
  // No re-read of the chat list for it.
  assert.equal(calls.filter((c) => c === 'getDialogs').length, 1);
  await account.stop();
});

test('a chat is read by its stored peer; a refused address book waits (R-Y34)', async () => {
  const store = createMemoryStore();
  await seed(store);
  const calls = [];
  const client = groupClient(calls);
  let clock = 1_000_000;
  const account = createTelegramAccount({
    pace: NO_PACE,
    store,
    importer,
    now: () => clock,
    clientFactory: async () => client,
    pollMs: 0,
    backfillMs: 0,
  });
  await account.sync({ full: true });
  await account.sync();
  assert.equal(
    calls.filter((c) => c === 'getContacts').length,
    1,
    'refused once, not asked again on the next sync'
  );
  const status = await account.status();
  assert.equal(status.requests.methods.contacts, 300);
  // Everything else paused for half a minute after that refusal.
  clock += 31_000;
  // Not whole yet: an older page is asked for, by the stored peer.
  await store.put({
    ...(await store.get('history:telegram:-1005')),
    complete: false,
  });
  await account.history({ chat: '-1005', before: 20, limit: 50 });
  assert.ok(calls.includes('getMessages:InputPeerChannel'));
  assert.equal(calls.includes('getEntity'), false);
  await account.stop();
});
