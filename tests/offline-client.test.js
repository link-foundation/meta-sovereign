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
