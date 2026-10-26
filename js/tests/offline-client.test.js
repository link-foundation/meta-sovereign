/**
 * Offline-first client behavior. Verifies the SPA can write/read
 * links with no server, then route derived queries to the server when
 * one is attached, and fall back to local computation if the server
 * starts failing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBrowserStore } from '../src/storage/browser-store.js';
import {
  createBuildWatch,
  createOfflineClient,
  createRediscovery,
} from '../src/web/client.js';
import { createMemoryStore } from '../src/storage/index.js';

test('offline mode: writes/reads land in local store with no server', async () => {
  const store = await createBrowserStore();
  const client = createOfflineClient({ store, server: null });
  assert.equal(client.isOnline(), false);

  await client.put({ id: 'l:hello', tokens: ['hi'] });
  const got = await client.get('l:hello');
  assert.equal(got.id, 'l:hello');

  const all = await client.links();
  assert.equal(all.length, 1);
});

test('offline mode: autocomplete is computed locally from history', async () => {
  const store = await createBrowserStore();
  const client = createOfflineClient({ store, server: null });
  await client.put({
    id: 'msg:tg:1',
    tokens: ['message'],
    sender: 'me',
    body: 'hello there',
  });
  await client.put({
    id: 'msg:tg:2',
    tokens: ['message'],
    sender: 'me',
    body: 'hello there',
  });
  await client.put({
    id: 'msg:tg:3',
    tokens: ['message'],
    sender: 'me',
    body: 'goodbye now',
  });

  const sugg = await client.autocomplete('hello');
  assert.equal(sugg.length, 1);
  assert.equal(sugg[0].text, 'hello there');
  assert.equal(sugg[0].count, 2);
});

test('online mode: derived query routes to the server', async () => {
  const store = await createBrowserStore();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return {
      ok: true,
      json: async () => [{ text: 'from-server', count: 1 }],
    };
  };
  const client = createOfflineClient({
    store,
    server: { origin: 'http://x', fetchImpl },
  });
  assert.equal(client.isOnline(), true);

  const sugg = await client.autocomplete('greet');
  assert.deepEqual(sugg, [{ text: 'from-server', count: 1 }]);
  assert.equal(calls.length, 1);
});

test('server failure flips client to offline and keeps working', async () => {
  const store = await createBrowserStore();
  await store.put({
    id: 'msg:tg:9',
    tokens: ['message'],
    sender: 'me',
    body: 'flap test',
  });
  const fetchImpl = async () => {
    throw new Error('network down');
  };
  const events = [];
  const client = createOfflineClient({
    store,
    server: { origin: 'http://x', fetchImpl },
  });
  client.on((e) => events.push(e));

  const sugg = await client.autocomplete('flap');
  assert.equal(sugg[0].text, 'flap test');
  assert.equal(client.isOnline(), false);
  assert.ok(events.some((e) => e.type === 'mode-change' && e.online === false));
});

test('a client gone offline after a failed read comes back with its server', async () => {
  const store = await createBrowserStore();
  let up = false;
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(new URL(url).pathname);
    if (!up) {
      throw new Error('busy');
    }
    return { ok: true, json: async () => [] };
  };
  const timers = [];
  const client = createOfflineClient({
    store,
    server: { origin: 'http://x', fetchImpl },
    setTimer: (fn) => timers.push(fn),
    clearTimer: () => {},
  });
  const events = [];
  client.on((e) => events.push(e.online));
  await client.autocomplete('a');
  assert.equal(client.isOnline(), false);
  assert.equal(timers.length, 1, 'one check is planned, not one per read');
  await client.autocomplete('b');
  assert.equal(timers.length, 1);
  // Still down: the next check is planned.
  await timers.shift()();
  assert.equal(client.isOnline(), false);
  assert.equal(asked.at(-1), '/api/status');
  up = true;
  await timers.shift()();
  assert.equal(client.isOnline(), true);
  assert.deepEqual(events, [false, true]);
  assert.equal(timers.length, 0);
});

test('a slow or failed read does not take the app offline while the server answers', async () => {
  const store = await createBrowserStore();
  const asked = [];
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    asked.push(path);
    if (path === '/api/status') {
      return { ok: true, json: async () => ({}) };
    }
    throw new Error('timed out in the browser queue');
  };
  const events = [];
  const client = createOfflineClient({
    store,
    server: { origin: 'http://x', fetchImpl },
  });
  client.on((e) => events.push(e));
  assert.equal(await client.chatPage({ key: 'telegram:1' }), null);
  assert.equal(client.isOnline(), true);
  assert.deepEqual(asked, ['/api/chat/messages', '/api/status']);
  assert.deepEqual(events, []);
});

test('writing a broadcast link triggers the local handler bus when offline', async () => {
  // The handler bus runs in the SPA when offline so the user can still
  // queue broadcasts; this just checks the link is shaped correctly.
  const store = await createBrowserStore();
  const client = createOfflineClient({ store, server: null });

  const link = await client.broadcast({ text: 'hi', networks: ['telegram'] });
  assert.ok(link.id.startsWith('broadcast:'));
  assert.deepEqual(link.networks, ['telegram']);
  assert.equal(link.body, 'hi');

  const persisted = await client.get(link.id);
  assert.equal(persisted.id, link.id);
});

test('offline mode: suggest answers from the local reply graph', async () => {
  const store = createMemoryStore();
  const client = createOfflineClient({ store, server: null });
  const base = Date.now() - 60 * 60_000;
  const at = (minute) => new Date(base + minute * 60_000).toISOString();
  await client.put({
    id: 'msg:vk:1',
    source: 'vk',
    chat: '1',
    sender: 'u1',
    body: 'Привет',
    timestamp: at(0),
  });
  await client.put({
    id: 'msg:vk:2',
    source: 'vk',
    chat: '1',
    sender: 'me',
    body: 'Привет, как дела?',
    timestamp: at(1),
  });
  await client.put({
    id: 'msg:vk:3',
    source: 'vk',
    chat: '2',
    sender: 'u2',
    body: 'привет!',
    timestamp: at(2),
  });
  // A reply given once shows when its start is typed.
  const out = await client.suggest({ source: 'vk', chat: '2', typed: 'При' });
  assert.equal(out.stage, 'reply');
  assert.deepEqual(
    out.suggestions.filter((s) => s.kind === 'reply').map((s) => s.text),
    ['Привет, как дела?']
  );
  await client.put({
    id: 'msg:vk:4',
    source: 'vk',
    chat: '2',
    sender: 'me',
    body: 'Привет!',
    timestamp: at(3),
  });
  await client.put({
    id: 'msg:vk:5',
    source: 'vk',
    chat: '3',
    sender: 'u3',
    body: 'Привет',
    timestamp: at(4),
  });
  const live = await client.suggest({
    source: 'vk',
    chat: '3',
    typed: 'Прив',
  });
  assert.equal(live.suggestions.filter((s) => s.kind === 'reply').length, 2);
});

test('online mode: links() adds the server links to the local ones', async () => {
  // Issue #31 / PR #34: the chat lists api.links(); with the archive on
  // the server, an online browser used to see an empty inbox.
  const store = await createBrowserStore();
  await store.put({ id: 'msg:tg:1', body: 'edited here' });
  await store.put({ id: 'note:local', body: 'only here' });
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return {
      ok: true,
      json: async () => [
        { id: 'msg:tg:1', body: 'old copy' },
        { id: 'msg:vk:2', body: 'only on the server' },
      ],
    };
  };
  const client = createOfflineClient({
    store,
    server: { origin: 'http://x', fetchImpl },
  });
  const byId = Object.fromEntries(
    (await client.links()).map((link) => [link.id, link.body])
  );
  assert.deepEqual(calls, ['http://x/links']);
  assert.deepEqual(byId, {
    'msg:tg:1': 'edited here',
    'note:local': 'only here',
    'msg:vk:2': 'only on the server',
  });

  const down = createOfflineClient({
    store,
    server: {
      origin: 'http://x',
      fetchImpl: async () => {
        throw new Error('network down');
      },
    },
  });
  assert.equal((await down.links()).length, 2);
  assert.equal(down.isOnline(), false);
});

test('the local copy reloads itself when its server comes back with a new build', async () => {
  let etag = '"a"';
  const asked = [];
  let reloads = 0;
  const watch = createBuildWatch({
    bundleUrl: 'http://127.0.0.1:8787/app.min.js',
    fetchImpl: async (url, init) => {
      asked.push([url, init.cache]);
      return { ok: true, headers: { get: () => etag } };
    },
    reload: () => {
      reloads += 1;
    },
  });
  assert.equal(await watch.check(), false, 'the same build stays');
  etag = '"b"';
  assert.equal(await watch.check(), true);
  assert.equal(await watch.check(), false, 'one reload only');
  assert.equal(reloads, 1);
  assert.deepEqual(asked[0], ['http://127.0.0.1:8787/app.min.js', 'no-cache']);
});

test('a copy opened while its server was down looks again until it answers', async () => {
  const timers = [];
  let up = false;
  const found = [];
  createRediscovery({
    discover: async () => (up ? { origin: 'http://127.0.0.1:8787' } : null),
    found: (server) => found.push(server.origin),
    delays: [5, 10],
    setTimer: (fn, ms) => timers.push([fn, ms]),
    clearTimer: () => {},
  });
  await timers.shift()[0]();
  await timers.shift()[0]();
  assert.deepEqual(
    timers.map(([, ms]) => ms),
    [10],
    'the last wait repeats'
  );
  up = true;
  await timers.shift()[0]();
  assert.deepEqual(found, ['http://127.0.0.1:8787']);
  assert.equal(timers.length, 0);

  const stopped = createRediscovery({
    discover: async () => ({ origin: 'x' }),
    found: () => found.push('late'),
    setTimer: (fn, ms) => timers.push([fn, ms]),
    clearTimer: () => {},
  });
  stopped.stop();
  await timers.shift()[0]();
  assert.equal(found.length, 1, 'a stopped search finds nothing');
});

test('rediscovery wakes on returning to the tab and coalesces overlapping checks', async () => {
  const events = new globalThis.EventTarget();
  const document = new globalThis.EventTarget();
  document.visibilityState = 'hidden';
  const timers = new Map();
  let nextId = 0;
  let calls = 0;
  let release;
  let up = false;
  const found = [];
  const watch = createRediscovery({
    events,
    document,
    discover: () => {
      calls += 1;
      return up
        ? { origin: 'https://127.0.0.1:8787' }
        : new Promise((r) => {
            release = r;
          });
    },
    found: (server) => found.push(server.origin),
    setTimer: (fn) => {
      timers.set(++nextId, fn);
      return nextId;
    },
    clearTimer: (id) => timers.delete(id),
  });
  const pending = watch.check();
  events.dispatchEvent(new globalThis.Event('focus'));
  events.dispatchEvent(new globalThis.Event('online'));
  await Promise.resolve();
  assert.equal(calls, 1, 'one discovery at a time');
  release(null);
  await pending;
  assert.equal(timers.size, 1, 'one background retry remains');
  document.dispatchEvent(new globalThis.Event('visibilitychange'));
  assert.equal(calls, 1, 'a hidden tab does not wake the search');
  up = true;
  document.visibilityState = 'visible';
  document.dispatchEvent(new globalThis.Event('visibilitychange'));
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  assert.deepEqual(found, ['https://127.0.0.1:8787']);
  assert.equal(timers.size, 0);
  events.dispatchEvent(new globalThis.Event('focus'));
  events.dispatchEvent(new globalThis.Event('online'));
  await watch.check();
  assert.equal(calls, 2, 'successful discovery removes wake listeners');
});

test('stopping rediscovery during a probe prevents a late reload or retry', async () => {
  let release;
  let found = 0;
  let scheduled = 0;
  const watch = createRediscovery({
    discover: () =>
      new Promise((r) => {
        release = r;
      }),
    found: () => {
      found += 1;
    },
    setTimer: () => ++scheduled,
    clearTimer: () => {},
  });
  const pending = watch.check();
  await Promise.resolve();
  watch.stop();
  release({ origin: 'https://127.0.0.1:8787' });
  await pending;
  assert.equal(found, 0);
  assert.equal(scheduled, 1);
});
