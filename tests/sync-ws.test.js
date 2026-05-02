/**
 * WebSocket sync transport — tests the same put/get round-trip used
 * by the TCP transport, plus the upgrade handshake on a real http
 * server. Confirms the transport contract (`{ send, onMessage }`) is
 * identical to the loopback / tcp variants so `createPeer().connect`
 * works unchanged.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { createMemoryStore } from '../src/storage/index.js';
import {
  createPeer,
  vcTick,
  attachSyncWebSocket,
  startSyncWebSocketListener,
  connectSyncWebSocket,
} from '../src/sync/index.js';

const settle = () => new Promise((r) => setTimeout(r, 30));

test('ws transport replicates puts both ways', async () => {
  const aStore = createMemoryStore();
  const bStore = createMemoryStore();
  const aPeer = createPeer(aStore, { node: 'a' });
  const bPeer = createPeer(bStore, { node: 'b' });

  const listener = await startSyncWebSocketListener({ port: 0 });
  const client = await connectSyncWebSocket({ port: listener.port });

  aPeer.connect(listener.transport);
  bPeer.connect(client.transport);

  await aStore.put({
    id: 'l:1',
    tokens: ['x'],
    vc: vcTick({}, 'a'),
  });
  await settle();
  await settle();

  const replicated = await bStore.get('l:1');
  assert.equal(replicated?.id, 'l:1');

  await bStore.put({
    id: 'l:2',
    tokens: ['y'],
    vc: vcTick({}, 'b'),
  });
  await settle();
  await settle();

  const back = await aStore.get('l:2');
  assert.equal(back?.id, 'l:2');

  await client.close();
  await listener.close();
});

test('attachSyncWebSocket can ride on an existing http server', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200);
    res.end('hi');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const handle = attachSyncWebSocket(server, { path: '/ws' });
  const port = server.address().port;
  const client = await connectSyncWebSocket({ port, path: '/ws' });

  const aStore = createMemoryStore();
  const bStore = createMemoryStore();
  createPeer(aStore, { node: 'a' }).connect(handle.transport);
  createPeer(bStore, { node: 'b' }).connect(client.transport);

  await aStore.put({ id: 'l:c', tokens: ['z'], vc: vcTick({}, 'a') });
  await settle();
  await settle();
  assert.equal((await bStore.get('l:c'))?.id, 'l:c');

  await client.close();
  handle.close();
  await new Promise((r) => server.close(r));
});

test('client connection to wrong path is refused', async () => {
  const listener = await startSyncWebSocketListener({
    port: 0,
    path: '/ws',
  });
  await assert.rejects(
    connectSyncWebSocket({ port: listener.port, path: '/wrong' })
  );
  await listener.close();
});
