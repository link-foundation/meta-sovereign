/**
 * Offline-first client behavior. Verifies the SPA can write/read
 * links with no server, then route derived queries to the server when
 * one is attached, and fall back to local computation if the server
 * starts failing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBrowserStore } from '../src/storage/browser-store.js';
import { createOfflineClient } from '../src/web/client.js';
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
  const at = (minute) =>
    new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString();
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
  const out = await client.suggest({ source: 'vk', chat: '2' });
  assert.equal(out.stage, 'reply');
  assert.deepEqual(
    out.suggestions.map((s) => s.text),
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
  const live = await client.suggest({ source: 'vk', chat: '3' });
  assert.equal(live.suggestions.length, 2);
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
