import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createReplyCache } from '../src/replies/reply-cache.js';
import { buildReplyIndex } from '../src/replies/reply-graph.js';
import {
  createLocalStorageDriver,
  createInMemoryDriver,
} from '../src/storage/browser-store.js';
import { snapshotLocks, snapshotStorage } from './helpers/snapshot-locks.mjs';

const full = (version, body = version) => ({
  version,
  self: ['me'],
  windowMs: 86_400_000,
  links: buildReplyIndex([
    ...[0, 1].flatMap((i) => [
      {
        id: `msg:vk:q${i}`,
        source: 'vk',
        chat: `example${i}`,
        sender: 'friend',
        body: 'Question',
        timestamp: new Date(Date.now() - 2000).toISOString(),
      },
      {
        id: `msg:vk:a${i}`,
        source: 'vk',
        chat: `example${i}`,
        sender: 'me',
        body: 'Useful answer',
        timestamp: new Date(Date.now() - 1000).toISOString(),
      },
    ]),
    {
      id: `msg:vk:${version}`,
      source: 'vk',
      chat: '1',
      sender: 'friend',
      body,
      timestamp: new Date().toISOString(),
    },
  ]).modelLinks(),
});
const text = (cache) => cache.toAnswer({ source: 'vk', chat: '1' });
const tick = async (condition) => {
  for (let i = 0; i < 100; i += 1) {
    if (await condition()) {
      return;
    }
    await nextTurn();
  }
  assert.fail('the finite cache operation did not finish');
};

const fixture = (t, { notify = true } = {}) => {
  const storage = snapshotStorage();
  const locks = snapshotLocks();
  const roots = new Map();
  const caches = [];
  const errors = [];
  const driver = (key = 'shared') => {
    if (!roots.has(key)) {
      roots.set(key, new Set());
    }
    const listeners = roots.get(key);
    return createLocalStorageDriver(storage, key, {
      locks,
      notifications: {
        watch(fn) {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        publish() {
          if (notify) {
            for (const fn of listeners) {
              globalThis.queueMicrotask(fn);
            }
          }
        },
      },
    });
  };
  const open = async (fetchModel = async () => null, options = {}) => {
    const cache = createReplyCache({
      driver: driver(),
      fetchModel,
      saveMs: 60_000,
      nudgeMs: 0,
      onError: (error) => errors.push(error),
      ...options,
    });
    caches.push(cache);
    await cache.start();
    return cache;
  };
  t.after(async () => {
    await Promise.all(caches.map((cache) => cache.close().catch(() => {})));
    for (const listeners of roots.values()) {
      assert.equal(listeners.size, 0);
    }
  });
  return { storage, driver, open, errors };
};

test(
  'reply caches refresh live peers, isolate account roots and reload offline',
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t);
    const first = await f.open(async () => full('alpha.0'));
    await first.flush();
    const second = await f.open();
    const other = await f.open(async () => null, {
      driver: f.driver('other-account'),
    });
    assert.equal(second.version(), 'alpha.0');
    assert.equal(other.ready(), false);
    let model = full('alpha.2');
    const third = await f.open(async () => model);
    await third.flush();
    await tick(() => second.version() === 'alpha.2');
    assert.equal(text(first), 'alpha.2');
    model = null;
    const reopened = await f.open();
    assert.equal(reopened.version(), 'alpha.2');
    assert.equal(text(reopened), 'alpha.2');
    assert.deepEqual(f.errors, []);
  }
);

test(
  'a stale cache cannot replace a newer same-build model or relearn its counts',
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t, { notify: false });
    const older = await f.open(async () => full('alpha.0'));
    const newer = await f.open(async () => full('alpha.9'));
    await newer.flush();
    await older.flush();
    assert.equal(older.version(), 'alpha.9');
    const snapshot = await f.driver().load();
    assert.equal(snapshot.links[0].version, 'alpha.9');
    const expected = older.stats();
    await older.refresh();
    await older.flush();
    assert.deepEqual(older.stats(), expected);
    assert.equal(text(older), 'alpha.9');
  }
);

test(
  'different concurrent builds refuse stale replacement until a fresh full fetch',
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t, { notify: false });
    const first = await f.open(async () => full('alpha.0'));
    const second = await f.open(async () => full('beta.0'));
    await first.flush();
    await assert.rejects(second.flush(), { code: 'REPLY_CACHE_CONFLICT' });
    assert.equal(
      text(second),
      'beta.0',
      'unsaved model remains usable in memory'
    );
    assert.equal((await f.driver().load()).links[0].version, 'alpha.0');
    assert.deepEqual(second.persistence(), {
      dirty: true,
      code: 'REPLY_CACHE_CONFLICT',
      closed: false,
    });
    await second.sync();
    await second.flush();
    assert.equal((await f.driver().load()).links[0].version, 'beta.0');
    assert.ok(f.errors.every((error) => Object.keys(error).join() === 'code'));
  }
);

test(
  'slow cache saves serialize flush and a later authoritative model',
  { timeout: 3000 },
  async (t) => {
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    const base = createInMemoryDriver();
    let active = 0;
    let maximum = 0;
    let calls = 0;
    let model = full('alpha.0');
    const cache = createReplyCache({
      fetchModel: async () => model,
      driver: {
        load: base.load,
        async save(snapshot) {
          calls += 1;
          active += 1;
          maximum = Math.max(maximum, active);
          try {
            if (calls === 1) {
              entered.resolve();
              await release.promise;
            }
            await base.save(snapshot);
          } finally {
            active -= 1;
          }
        },
      },
    });
    t.after(() => cache.close());
    await cache.start();
    const first = cache.flush();
    await entered.promise;
    model = full('alpha.2');
    const later = cache.sync();
    const flushed = cache.flush();
    try {
      await nextTurn();
      assert.equal(calls, 1);
    } finally {
      release.resolve();
      await Promise.all([first, later, flushed]);
    }
    await cache.flush();
    assert.equal(maximum, 1);
    assert.equal((await base.load()).links[0].version, 'alpha.2');
  }
);

test(
  'quota refusal retains the model, reports a code and flush explicitly retries',
  { timeout: 3000 },
  async (t) => {
    const base = createInMemoryDriver();
    let fail = true;
    const errors = [];
    const cache = createReplyCache({
      fetchModel: async () => full('alpha.0'),
      onError: (error) => errors.push(error),
      driver: {
        load: base.load,
        save: (snapshot) => {
          if (fail) {
            throw Object.assign(new Error('private payload'), {
              code: 'QUOTA',
            });
          }
          return base.save(snapshot);
        },
      },
    });
    t.after(() => cache.close());
    await cache.start();
    await assert.rejects(cache.flush(), { code: 'QUOTA' });
    assert.equal(text(cache), 'alpha.0');
    assert.deepEqual(errors, [{ code: 'QUOTA' }]);
    assert.equal(await base.load(), null);
    fail = false;
    await cache.flush();
    assert.deepEqual(cache.persistence(), {
      dirty: false,
      code: null,
      closed: false,
    });
  }
);

test(
  'a root change during fetch discards a delta based on the old in-memory version',
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t);
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    const first = await f.open(async () => full('alpha.0'));
    await first.flush();
    let waiting = false;
    const second = await f.open(async ({ since }) => {
      if (waiting) {
        entered.resolve(since);
        return release.promise;
      }
      return null;
    });
    waiting = true;
    const syncing = second.sync();
    assert.equal(await entered.promise, 'alpha.0');
    const newest = await f.open(async () => full('alpha.2'));
    await newest.flush();
    await tick(() => second.version() === 'alpha.2');
    waiting = false;
    release.resolve({
      version: 'alpha.1',
      changes: [
        {
          id: 'msg:vk:old',
          source: 'vk',
          chat: '1',
          sender: 'friend',
          body: 'stale',
          timestamp: new Date().toISOString(),
        },
      ],
    });
    await syncing;
    assert.equal(text(second), 'alpha.2');
    assert.equal(second.version(), 'alpha.2');
  }
);

test(
  'close cancels an ignored fetch, ignores its late response and detaches listeners',
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t);
    const cache = await f.open(async () => full('alpha.0'));
    await cache.flush();
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    const driver = f.driver();
    const controller = new AbortController();
    const closing = createReplyCache({
      driver,
      signal: controller.signal,
      fetchModel: async ({ signal }) => {
        entered.resolve(signal);
        return release.promise;
      },
    });
    const starting = closing.start();
    const signal = await entered.promise;
    assert.equal(text(closing), 'alpha.0');
    controller.abort();
    await Promise.all([closing.close(), starting]);
    assert.equal(signal.aborted, true);
    release.resolve(full('beta.0'));
    await nextTurn();
    assert.equal(closing.version(), 'alpha.0');
    assert.equal(closing.persistence().closed, true);
  }
);

test(
  'invalid snapshots and foreign/noncontiguous deltas never replace the saved model',
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t, { notify: false });
    let model = full('alpha.0');
    const cache = await f.open(async () => model);
    await cache.flush();
    for (const invalid of [
      { version: 'other.1', changes: [] },
      { version: 'alpha.2', changes: [] },
    ]) {
      model = invalid;
      await assert.rejects(cache.sync(), { code: 'REPLY_CACHE_CONFLICT' });
      assert.equal(cache.version(), 'alpha.0');
    }
    f.storage.setItem(
      'shared',
      JSON.stringify({ links: [{ id: 'reply-model', version: 'new-format' }] })
    );
    await assert.rejects(cache.refresh(), { code: 'REPLY_CACHE_CONFLICT' });
    model = full('beta.0');
    await cache.sync();
    await assert.rejects(cache.flush(), { code: 'REPLY_CACHE_CONFLICT' });
    assert.equal(
      JSON.parse(f.storage.getItem('shared')).links[0].version,
      'new-format'
    );
    assert.equal(text(cache), 'beta.0');
  }
);

test('chunk limits reject nonfinite inputs before scheduling work', () => {
  for (const chunk of [0, -1, Infinity, NaN, 1.5]) {
    assert.throws(() => createReplyCache({ chunk }), RangeError);
  }
});

test(
  'close waits for a held save and cancels queued idle work',
  { timeout: 3000 },
  async (t) => {
    const previousIdle = globalThis.requestIdleCallback;
    const previousCancel = globalThis.cancelIdleCallback;
    let idle;
    let cancelled = 0;
    globalThis.requestIdleCallback = (fn) => {
      idle = fn;
      return 7;
    };
    globalThis.cancelIdleCallback = (id) => {
      assert.equal(id, 7);
      cancelled++;
    };
    t.after(() => {
      if (previousIdle === undefined) {
        delete globalThis.requestIdleCallback;
      } else {
        globalThis.requestIdleCallback = previousIdle;
      }
      if (previousCancel === undefined) {
        delete globalThis.cancelIdleCallback;
      } else {
        globalThis.cancelIdleCallback = previousCancel;
      }
    });
    const base = createInMemoryDriver();
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    let calls = 0;
    const cache = createReplyCache({
      fetchModel: async () => full('alpha.0'),
      driver: {
        load: base.load,
        async save(next) {
          calls++;
          entered.resolve();
          await release.promise;
          await base.save(next);
        },
      },
    });
    await cache.start();
    await tick(() => idle !== undefined);
    let done = false;
    const close = cache.close().then(() => {
      done = true;
    });
    await entered.promise;
    try {
      await nextTurn();
      assert.equal(done, false);
      assert.equal(cancelled, 1);
      idle();
    } finally {
      release.resolve();
      await close;
    }
    await nextTurn();
    assert.equal(calls, 1, 'the cancelled callback cannot issue another save');
    assert.equal((await base.load()).links[0].version, 'alpha.0');
  }
);

test(
  'busy cache coordination has a finite eight-attempt budget',
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t, { notify: false });
    const base = f.driver();
    let busy = true;
    let calls = 0;
    const cache = await f.open(async () => full('alpha.0'), {
      driver: {
        ...base,
        async save(...args) {
          calls++;
          if (busy) {
            throw Object.assign(new Error('busy'), {
              code: 'STORE_SNAPSHOT_BUSY',
            });
          }
          return base.save(...args);
        },
      },
    });
    await assert.rejects(cache.flush(), { code: 'STORE_SNAPSHOT_BUSY' });
    assert.equal(calls, 8);
    assert.equal(cache.persistence().dirty, true);
    busy = false;
    await cache.flush();
    assert.equal(calls, 9);
  }
);

test(
  'a failed chunked build preserves the prior owner identities and model',
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t, { notify: false });
    let model = full('alpha.0');
    const cache = await f.open(async () => model, { chunk: 1 });
    await cache.flush();
    model = {
      ...full('beta.0'),
      self: ['friend'],
      links: [
        { id: 'sent-link:1', text: 'discarded', count: 2 },
        { id: 'chat-link', chats: 5 },
      ],
    };
    await assert.rejects(cache.sync(), TypeError);
    assert.equal(cache.version(), 'alpha.0');
    assert.equal(text(cache), 'alpha.0');
    assert.equal((await f.driver().load()).links[0].version, 'alpha.0');
  }
);

test(
  'same-version committed settings replace a clean reader without mixing owner IDs',
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t);
    const initial = await f.open(async () => full('alpha.0'));
    await initial.flush();
    const second = await f.open();
    const changed = { ...full('alpha.0'), self: ['friend'], windowMs: 60_000 };
    const source = await f.open(async () => changed);
    await source.flush();
    await tick(() => text(second) === '');
    assert.equal(text(initial), '');
    assert.equal((await f.driver().load()).links[0].windowMs, 60_000);
  }
);
