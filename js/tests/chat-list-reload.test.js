// The chat list stays whole while the server is busy or restarting: a
// failed load keeps what is shown and is tried again, never shrinking
// the list to the few chats this browser holds.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBrowserStore } from '../src/storage/browser-store.js';
import { createOfflineClient } from '../src/web/client.js';

const head = (chat) => ({
  id: `msg:telegram:${chat}:1`,
  source: 'telegram',
  chat,
  sender: 'x',
  body: 'hi',
  timestamp: '2021-01-01T00:00:00.000Z',
});

const serverWith = (state) => ({
  origin: 'http://server.test',
  fetchImpl: async (url) => {
    const path = url.replace('http://server.test', '');
    const ok = (body) => ({ ok: true, status: 200, json: async () => body });
    if (path === '/api/status') {
      return ok({ ok: true });
    }
    if (state.down) {
      return { ok: false, status: 503, json: async () => ({}) };
    }
    if (path.startsWith('/links')) {
      return ok([{ id: 'read:telegram:1', folder: 0 }]);
    }
    if (path === '/api/chat/heads') {
      return ok([head('1'), head('2')]);
    }
    return { ok: false, status: 404, json: async () => ({}) };
  },
});

test('a server that does not answer the chat list is an error, not a short list', async () => {
  const store = await createBrowserStore();
  await store.put(head('local'));
  const state = { down: true };
  const client = createOfflineClient({ store, server: serverWith(state) });
  await assert.rejects(client.chatLinks(), (error) => {
    assert.deepEqual(
      error.local.map((l) => l.id),
      ['msg:telegram:local:1']
    );
    return true;
  });
  state.down = false;
  const links = await client.chatLinks();
  assert.deepEqual(links.map((l) => l.id).sort(), [
    'msg:telegram:1:1',
    'msg:telegram:2:1',
    'msg:telegram:local:1',
    'read:telegram:1',
  ]);
});

test('without a server the chat list is this browser’s own', async () => {
  const store = await createBrowserStore();
  await store.put(head('local'));
  const client = createOfflineClient({ store, server: null });
  assert.equal((await client.chatLinks()).length, 1);
});
