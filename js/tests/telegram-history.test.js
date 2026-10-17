// Telegram history, store first (R-Y24 .. R-Y28): what of a chat is
// stored, what Telegram is asked for (and at which priority), and what
// of a message is kept. A fake GramJS client stands in for Telegram —
// nothing here touches the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore } from '../src/storage/universal.js';
import {
  coverSlice,
  createFetchQueue,
  historyLinkId,
  historyPlan,
  rawMessage,
} from '../src/sources/telegram-history.js';
import { dialogsCursor } from '../src/sources/telegram-pages.js';
import { createTelegramAccount } from '../src/sources/telegram-account.js';

const AT = '2026-10-17T10:00:00.000Z';

test('a newest slice shorter than the page is the whole chat', () => {
  assert.deepEqual(
    coverSlice(null, { ids: [5, 4, 3], limit: 50, mode: 'newest', at: AT }),
    { newest: 5, oldest: 3, complete: true, at: AT }
  );
  assert.deepEqual(
    coverSlice(null, { ids: [9, 8], limit: 2, mode: 'newest', at: AT }),
    { newest: 9, oldest: 8, complete: false, at: AT }
  );
});

test('older pages move the stretch back until the first message', () => {
  const first = { newest: 9, oldest: 8, complete: false, at: AT };
  const back = coverSlice(first, {
    ids: [7, 6],
    limit: 2,
    mode: 'older',
    at: AT,
  });
  assert.equal(back.oldest, 6);
  assert.equal(back.complete, false);
  const start = coverSlice(back, { ids: [5], limit: 2, mode: 'older', at: AT });
  assert.equal(start.oldest, 5);
  assert.equal(start.complete, true);
});

test('a full read after `newest` may leave a hole: the stretch restarts', () => {
  const before = { newest: 10, oldest: 1, complete: true, at: AT };
  const joined = coverSlice(before, {
    ids: [12, 11],
    limit: 5,
    mode: 'since',
    at: AT,
  });
  assert.deepEqual(joined, { newest: 12, oldest: 1, complete: true, at: AT });
  const gap = coverSlice(before, {
    ids: [30, 29],
    limit: 2,
    mode: 'since',
    at: AT,
  });
  assert.deepEqual(gap, { newest: 30, oldest: 29, complete: false, at: AT });
});

test('the plan asks Telegram only for what the store lacks', () => {
  const now = Date.parse(AT);
  assert.deepEqual(historyPlan(null, { limit: 50, now }), {
    mode: 'newest',
    options: { limit: 50 },
  });
  const stored = { chat: '42', newest: 9, oldest: 3, complete: false, at: AT };
  assert.equal(historyPlan(stored, { limit: 50, now }), null);
  assert.deepEqual(historyPlan(stored, { before: 5, limit: 50, now }), {
    mode: 'older',
    options: { limit: 50, offsetId: 3 },
  });
  assert.equal(
    historyPlan({ ...stored, complete: true }, { before: 5, limit: 50, now }),
    null
  );
  // A channel's updates are not in the account's catch-up: asked again
  // after a minute.
  const channel = { ...stored, chat: '-1001' };
  assert.equal(historyPlan(channel, { limit: 50, now }), null);
  assert.deepEqual(historyPlan(channel, { limit: 50, now: now + 61_000 }), {
    mode: 'since',
    options: { limit: 50, minId: 9 },
  });
});

test('the queue runs the most urgent request first, one at a time', async () => {
  const queue = createFetchQueue();
  const order = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const first = queue.run('a', 'background', async () => {
    await gate;
    order.push('a');
  });
  const later = [
    queue.run('b', 'background', async () => order.push('b')),
    queue.run('c', 'prefetch', async () => order.push('c')),
    queue.run('d', 'view', async () => order.push('d')),
  ];
  // The same key asked again is one request, at the higher priority.
  const same = queue.run('b', 'list', async () => order.push('b2'));
  assert.equal(queue.pending('prefetch'), 3);
  release();
  await Promise.all([first, ...later, same]);
  assert.deepEqual(order, ['a', 'd', 'b', 'c']);
});

test("Telegram's wait holds prefetch and background work, not the view", async () => {
  let clock = 0;
  const queue = createFetchQueue({ now: () => clock });
  await assert.rejects(
    queue.run('x', 'view', async () => {
      throw Object.assign(new Error('FLOOD_WAIT_30'), {
        errorMessage: 'FLOOD_WAIT_30',
      });
    })
  );
  assert.equal(queue.heldFor(), 30_000);
  await assert.rejects(
    queue.run('y', 'prefetch', async () => 'no'),
    (error) => error.code === 'flood-wait'
  );
  assert.equal(await queue.run('z', 'view', async () => 'yes'), 'yes');
  clock = 31_000;
  assert.equal(await queue.run('y', 'background', async () => 'ok'), 'ok');
});

test('a message keeps everything Telegram said about it, as plain JSON', () => {
  const big = { toJSNumber: () => 1, toString: () => '9007199254740993' };
  const message = {
    id: 7,
    message: 'hi',
    date: 1700000000,
    out: false,
    views: 12,
    entities: [{ className: 'MessageEntityBold', offset: 0, length: 2 }],
    fwdFrom: { fromId: { userId: big }, date: 1690000000 },
    media: { photo: { fileReference: new Uint8Array([1, 2, 3]) } },
    editDate: new Date(Date.parse(AT)),
    _client: { secret: 'never stored' },
    sender: { id: 42, firstName: 'Alice' },
    originalArgs: { id: 7 },
    CONSTRUCTOR_ID: 1,
    getSender() {},
  };
  message.self = message;
  const raw = rawMessage(message);
  assert.equal(raw.id, 7);
  assert.equal(raw.views, 12);
  assert.equal(raw.entities[0].className, 'MessageEntityBold');
  assert.equal(raw.fwdFrom.fromId.userId, '9007199254740993');
  assert.deepEqual(raw.media.photo.fileReference, { bytes: 'AQID' });
  assert.equal(raw.editDate, AT);
  for (const key of [
    '_client',
    'sender',
    'originalArgs',
    'CONSTRUCTOR_ID',
    'getSender',
    'self',
  ]) {
    assert.equal(key in raw, false, key);
  }
  assert.doesNotThrow(() => JSON.stringify(raw));
});

test('the next page of the chat list starts after its oldest dialog', () => {
  assert.equal(dialogsCursor([]), null);
  assert.deepEqual(
    dialogsCursor([
      { id: 1, pinned: true, message: { id: 1, date: 10 } },
      { id: 2, message: { id: 5, date: 300 } },
      { id: 3, message: { id: 8, date: 200 } },
    ]),
    { offsetDate: 200, offsetId: 8, chat: '3' }
  );
});

// ---- the account, store first -------------------------------------------

const ALICE = { id: 42, firstName: 'Alice', username: 'alice' };

const seed = async (store) => {
  const put = (name, value) =>
    store.put({ id: `secret:telegram:${name}`, tokens: [], value });
  await put('user-session', 'fake-session');
  await put('api-id', '123');
  await put('api-hash', 'fake-hash');
};

// A chat of `count` messages; getMessages honours limit, offsetId, minId.
const longChat = (count) => {
  const all = Array.from({ length: count }, (_, i) => ({
    id: count - i,
    message: `m${count - i}`,
    date: 1700000000 + (count - i),
    senderId: 42,
  }));
  const calls = [];
  return {
    calls,
    setLogLevel() {},
    async connect() {},
    async disconnect() {},
    async getMe() {
      return { id: 1, self: true };
    },
    async getDialogs() {
      return [];
    },
    async getEntity() {
      return { ...ALICE, className: 'User' };
    },
    async getMessages(_entity, { limit, offsetId = 0, minId = 0 }) {
      calls.push({ limit, offsetId, minId });
      return all
        .filter((m) => (!offsetId || m.id < offsetId) && m.id > minId)
        .slice(0, limit);
    },
  };
};

const accountWith = (store, client) =>
  createTelegramAccount({
    store,
    clientFactory: async () => client,
    botLive: {
      async post() {
        throw new Error('no bot in this test');
      },
      async pullMessages() {
        return { links: [], nextOffset: null };
      },
    },
    pollMs: 0,
    backfillMs: 0,
  });

test('a chat read once is answered from the store (R-Y24)', async () => {
  const store = createMemoryStore();
  await seed(store);
  const client = longChat(120);
  const account = accountWith(store, client);
  const first = await account.history({ chat: '42', limit: 50 });
  assert.equal(first.written, 50);
  assert.equal(first.cached, false);
  const again = await account.history({ chat: '42', limit: 50 });
  assert.equal(again.cached, true);
  assert.equal(client.calls.length, 1);
  const record = await store.get(historyLinkId('42'));
  assert.equal(record.newest, 120);
  assert.equal(record.oldest, 71);
  // Every message keeps its whole Telegram record.
  const message = await store.get('msg:telegram:42:120');
  assert.equal(message.raw.id, 120);
  await account.stop();
});

test('scrolling back reads older pages until the first message', async () => {
  const store = createMemoryStore();
  await seed(store);
  const client = longChat(120);
  const account = accountWith(store, client);
  await account.history({ chat: '42', limit: 50 });
  const older = await account.history({ chat: '42', limit: 50, before: 71 });
  assert.equal(older.written, 50);
  assert.equal(client.calls.at(-1).offsetId, 71);
  const last = await account.history({ chat: '42', limit: 50, before: 21 });
  assert.equal(last.written, 20);
  assert.equal(last.complete, true);
  // The whole chat is stored: nothing more is asked for.
  const calls = client.calls.length;
  const done = await account.history({ chat: '42', limit: 50, before: 1 });
  assert.equal(done.cached, true);
  assert.equal(client.calls.length, calls);
  await account.stop();
});
