/**
 * WebRTC signaling broker tests.
 *
 * The broker is a tiny WebSocket relay; we verify the room semantics
 * by connecting two raw WS clients into the same room and checking
 * that messages from one peer reach the other (but not back to the
 * sender). Also verifies the `peer-joined` announcement and the
 * cross-room isolation.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { attachSignaling } from '../src/sync/webrtc-signaling.js';
import { connectSyncWebSocket } from '../src/sync/index.js';

const settle = () => new Promise((r) => setTimeout(r, 30));

const startSignalingServer = async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  const handle = attachSignaling(server, { path: '/rtc' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    port: server.address().port,
    handle,
    close: async () => {
      handle.close();
      await new Promise((r) => server.close(r));
    },
  };
};

test('signaling relays SDP frames between peers in same room', async () => {
  const server = await startSignalingServer();
  const a = await connectSyncWebSocket({
    port: server.port,
    path: '/rtc?room=alpha',
  });
  const b = await connectSyncWebSocket({
    port: server.port,
    path: '/rtc?room=alpha',
  });

  const aSeen = [];
  const bSeen = [];
  a.transport.onMessage((e) => aSeen.push(e));
  b.transport.onMessage((e) => bSeen.push(e));

  await settle();

  a.transport.send({ type: 'offer', sdp: 'fake-sdp' });
  await settle();

  const offers = bSeen.filter((e) => e.type === 'offer');
  assert.equal(offers.length, 1);
  assert.equal(offers[0].sdp, 'fake-sdp');
  assert.equal(
    aSeen.filter((e) => e.type === 'offer').length,
    0,
    'sender should not echo'
  );

  await a.close();
  await b.close();
  await server.close();
});

test('rooms are isolated', async () => {
  const server = await startSignalingServer();
  const a = await connectSyncWebSocket({
    port: server.port,
    path: '/rtc?room=alpha',
  });
  const b = await connectSyncWebSocket({
    port: server.port,
    path: '/rtc?room=beta',
  });

  const seen = [];
  b.transport.onMessage((e) => seen.push(e));

  a.transport.send({ type: 'offer', sdp: 'cross-room' });
  await settle();

  assert.equal(
    seen.filter((e) => e.type === 'offer').length,
    0,
    'beta room should not see alpha messages'
  );

  await a.close();
  await b.close();
  await server.close();
});

test('peer-joined fires for existing peers when new one arrives', async () => {
  const server = await startSignalingServer();
  const a = await connectSyncWebSocket({
    port: server.port,
    path: '/rtc?room=zeta',
  });
  const aSeen = [];
  a.transport.onMessage((e) => aSeen.push(e));

  const b = await connectSyncWebSocket({
    port: server.port,
    path: '/rtc?room=zeta',
  });
  await settle();

  assert.ok(aSeen.some((e) => e.type === 'peer-joined'));
  await a.close();
  await b.close();
  await server.close();
});
