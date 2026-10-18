// The slow download of whole histories (R-Y30): the chat list first,
// then private chats taking turns, then groups; channels never; and
// nothing while the user waits for something. Fakes only — nothing here
// touches the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore } from '../src/storage/universal.js';
import {
  backfillKind,
  backfillProgress,
  createBackfill,
  heapNearlyFull,
  nextBackfill,
} from '../src/sources/telegram-backfill.js';
import { historyLinkId } from '../src/sources/telegram-history.js';

const SYNC_ID = 'sync:telegram';

test('chat types map to private, group and channel', () => {
  assert.equal(backfillKind('personal_chat'), 'private');
  assert.equal(backfillKind('group'), 'group');
  assert.equal(backfillKind('channel'), 'channel');
  assert.equal(backfillKind(undefined), 'group');
});

const chats = [
  { chat: 'g1', chatType: 'group', at: '2026-10-17T09:00:00Z' },
  { chat: 'p1', chatType: 'personal_chat', at: '2026-10-16T09:00:00Z' },
  { chat: 'p2', chatType: 'personal_chat', at: '2026-10-17T08:00:00Z' },
  { chat: 'c1', chatType: 'channel', at: '2026-10-17T10:00:00Z' },
];

test('private chats come first, newest first, then take turns', () => {
  assert.deepEqual(nextBackfill(chats, new Map()), {
    chat: 'p2',
    kind: 'private',
    before: null,
  });
  const records = new Map([
    ['p2', { oldest: 40, at: '2026-10-17T10:00:00Z' }],
    ['p1', { oldest: 90, at: '2026-10-17T09:00:00Z' }],
  ]);
  // p1 was read longest ago: its turn, from where it stopped.
  assert.deepEqual(nextBackfill(chats, records), {
    chat: 'p1',
    kind: 'private',
    before: 90,
  });
});

test('groups follow once every private chat is whole; channels never', () => {
  const records = new Map([
    ['p1', { complete: true }],
    ['p2', { complete: true }],
  ]);
  assert.equal(nextBackfill(chats, records).chat, 'g1');
  records.set('g1', { complete: true });
  assert.equal(nextBackfill(chats, records), null);
  assert.deepEqual(backfillProgress('done', chats, records), {
    phase: 'done',
    chats: 3,
    complete: 3,
  });
});

const fakeQueue = (pending = 0, held = 0) => ({
  pending: () => pending,
  heldFor: () => held,
});

const backfillWith = (store, { queue = fakeQueue(), calls = [] } = {}) =>
  createBackfill({
    store,
    queue,
    syncId: SYNC_ID,
    credentials: async () => ({ kind: 'user' }),
    chats: async () => chats,
    pages: {
      async moreDialogs(request) {
        calls.push({ dialogs: request });
        await store.put({ id: SYNC_ID, tokens: [], dialogsComplete: true });
      },
      async history(request) {
        calls.push({ history: request });
        await store.put({
          id: historyLinkId(request.chat),
          tokens: [],
          chat: request.chat,
          complete: true,
        });
        return { written: 1 };
      },
    },
    everyMs: 0,
  });

test('the chat list is read first, then histories, at background priority', async () => {
  const store = createMemoryStore();
  const calls = [];
  const backfill = backfillWith(store, { calls });
  assert.equal(await backfill.step(), 'dialogs');
  assert.equal(calls[0].dialogs.priority, 'background');
  const order = [];
  for (let i = 0; i < 4; i += 1) {
    order.push(await backfill.step());
  }
  assert.deepEqual(order, ['private', 'private', 'group', 'done']);
  assert.deepEqual(
    calls.slice(1).map((c) => [c.history.chat, c.history.priority]),
    [
      ['p2', 'background'],
      ['p1', 'background'],
      ['g1', 'background'],
    ]
  );
  assert.equal(backfill.progress().phase, 'done');
});

test('nothing is downloaded while the user waits or Telegram asked to wait', async () => {
  const store = createMemoryStore();
  const calls = [];
  assert.equal(
    await backfillWith(store, { queue: fakeQueue(1), calls }).step(),
    'yield'
  );
  assert.equal(
    await backfillWith(store, { queue: fakeQueue(0, 5000), calls }).step(),
    'yield'
  );
  assert.equal(calls.length, 0);
});

test('nothing more is downloaded while the server memory is nearly full', async () => {
  const store = createMemoryStore();
  await store.put({ id: SYNC_ID, tokens: [], dialogsComplete: true });
  const calls = [];
  const logged = [];
  const backfill = createBackfill({
    store,
    queue: fakeQueue(),
    syncId: SYNC_ID,
    credentials: async () => ({ kind: 'user' }),
    chats: async () => chats,
    pages: {
      async history(request) {
        calls.push(request);
        return { written: 1 };
      },
    },
    log: (entry) => logged.push(entry.event),
    memoryFull: () => true,
    everyMs: 0,
  });
  assert.equal(await backfill.step(), 'memory');
  assert.equal(await backfill.step(), 'memory');
  assert.equal(calls.length, 0);
  assert.equal(backfill.progress().phase, 'memory');
  assert.deepEqual(logged, ['telegram_backfill_memory_full'], 'said once');
  assert.equal(
    heapNearlyFull({ used_heap_size: 71, heap_size_limit: 100 }),
    true
  );
  assert.equal(
    heapNearlyFull({ used_heap_size: 50, heap_size_limit: 100 }),
    false
  );
});
