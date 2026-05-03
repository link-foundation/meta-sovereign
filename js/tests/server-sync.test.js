/**
 * Verifies the local web server now bundles a WebSocket sync
 * endpoint (/ws) and a WebRTC signaling broker (/rtc) on the same
 * port the SPA is served from. This is the architecture the latest
 * directive requires: SPA hits one origin, picks up REST + sync +
 * signaling without any cross-origin gymnastics.
 *
 * Also verifies a written `broadcast:*` link fires the broadcast
 * handler that was bootstrapped onto the store.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/index.js';
import { createPeer, vcTick, connectSyncWebSocket } from '../src/sync/index.js';

const settle = () => new Promise((r) => setTimeout(r, 30));

test('main server exposes /ws sync alongside REST', async () => {
  const store = createMemoryStore();
  const handle = await startServer({ port: 0, store });

  const aStore = createMemoryStore();
  const client = await connectSyncWebSocket({
    port: handle.port,
    path: '/ws',
  });
  createPeer(aStore, { node: 'client' }).connect(client.transport);

  await store.put({
    id: 'l:server-side',
    tokens: ['x'],
    vc: vcTick({}, 'server'),
  });
  await settle();
  await settle();

  assert.equal((await aStore.get('l:server-side'))?.id, 'l:server-side');

  await aStore.put({
    id: 'l:client-side',
    tokens: ['y'],
    vc: vcTick({}, 'client'),
  });
  await settle();
  await settle();

  assert.equal((await store.get('l:client-side'))?.id, 'l:client-side');

  await client.close();
  await handle.close();
});

test('main server exposes /rtc signaling broker', async () => {
  const handle = await startServer({
    port: 0,
    store: createMemoryStore(),
  });

  const a = await connectSyncWebSocket({
    port: handle.port,
    path: '/rtc?room=test',
  });
  const b = await connectSyncWebSocket({
    port: handle.port,
    path: '/rtc?room=test',
  });

  const seen = [];
  b.transport.onMessage((e) => seen.push(e));

  a.transport.send({ type: 'offer', sdp: 'x' });
  await settle();

  assert.ok(seen.some((e) => e.type === 'offer' && e.sdp === 'x'));

  await a.close();
  await b.close();
  await handle.close();
});

test('writing a broadcast link fires the bootstrapped handler', async () => {
  const store = createMemoryStore();
  const handle = await startServer({ port: 0, store });

  await store.put({
    id: 'broadcast:tic',
    tokens: ['broadcast'],
    networks: ['telegram'],
    body: 'hi',
  });
  for (let i = 0; i < 8; i += 1) {
    await settle();
  }

  const persisted = await store.get('broadcast:tic');
  assert.equal(persisted.dispatched, true);
  assert.ok(Array.isArray(persisted.results));
  assert.equal(persisted.handledBy?.broadcast !== undefined, true);

  await handle.close();
});

test('REST + sync coexist: PUT /links also replicates over /ws', async () => {
  const store = createMemoryStore();
  const handle = await startServer({ port: 0, store });

  const aStore = createMemoryStore();
  const client = await connectSyncWebSocket({
    port: handle.port,
    path: '/ws',
  });
  createPeer(aStore, { node: 'client' }).connect(client.transport);

  await fetch(`http://127.0.0.1:${handle.port}/links`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 'l:rest-then-ws',
      tokens: ['rest'],
      vc: vcTick({}, 'http'),
    }),
  }).then((r) => r.json());
  await settle();
  await settle();

  assert.equal((await aStore.get('l:rest-then-ws'))?.id, 'l:rest-then-ws');

  await client.close();
  await handle.close();
});
