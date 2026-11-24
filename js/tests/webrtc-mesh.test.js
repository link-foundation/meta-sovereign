import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignalingRooms } from '../src/sync/signaling-room.js';
import { createWebRtcMesh } from '../src/sync/webrtc-mesh.js';
import { signalingChannel } from '../src/sync/webrtc-transport.js';

test('addressed signaling isolates recipients and authenticates the sender', () => {
  const messages = [];
  const relay = createSignalingRooms((socket, event) =>
    messages.push({ socket, event })
  );
  const a = relay.join('room', 'a');
  const b = relay.join('room', 'b');
  relay.join('room', 'c');
  relay.join('other', 'foreign');
  messages.length = 0;
  relay.receive('room', 'a', {
    type: 'offer',
    to: b,
    from: 'spoofed',
    sdp: 'fixture',
  });
  assert.deepEqual(messages, [
    { socket: 'b', event: { type: 'offer', to: b, from: a, sdp: 'fixture' } },
  ]);
  relay.receive('other', 'a', { type: 'offer', sdp: 'not a member' });
  relay.receive('room', 'a', { type: 'peer-left', peerId: b });
  relay.receive('room', 'a', {
    type: 'offer',
    to: 'missing',
    sdp: 'no broadcast fallback',
  });
  assert.equal(messages.length, 1);
});

test('departures are idempotent, rejoin has a fresh identity and legacy frames retain provenance', () => {
  const messages = [];
  const relay = createSignalingRooms((socket, event) =>
    messages.push({ socket, event })
  );
  const a = relay.join('room', 'a');
  const old = relay.join('room', 'b');
  messages.length = 0;
  relay.leave('room', 'b');
  relay.leave('room', 'b');
  assert.deepEqual(messages, [
    { socket: 'a', event: { type: 'peer-left', peerId: old } },
  ]);
  const fresh = relay.join('room', 'b');
  assert.notEqual(fresh, old);
  messages.length = 0;
  relay.receive('room', 'a', { type: 'answer', sdp: 'legacy', from: old });
  assert.deepEqual(messages, [
    { socket: 'b', event: { type: 'answer', sdp: 'legacy', from: a } },
  ]);
  relay.leave('room', 'a');
  relay.leave('room', 'b');
  assert.equal(relay.rooms.size, 0);
});

test('a broken departing socket cannot suppress other membership notifications', () => {
  const messages = [];
  const relay = createSignalingRooms((socket, event) => {
    if (socket === 'broken') {
      throw new Error('closed');
    }
    messages.push({ socket, event });
  });
  relay.join('room', 'broken');
  relay.join('room', 'alive');
  const id = relay.join('room', 'new');
  assert.ok(
    messages.some(
      ({ socket, event }) => socket === 'alive' && event.peerId === id
    )
  );
});

const fixture = () => {
  let receive;
  const sent = [];
  const created = [];
  const errors = [];
  const channel = signalingChannel({
    send: (event) => sent.push(event),
    onMessage: (handler) => {
      receive = handler;
    },
  });
  const mesh = createWebRtcMesh({
    signaling: channel,
    onError: (error) => errors.push(error),
    createTransport: ({ signaling }) => {
      const item = { incoming: [], starts: 0, closes: 0, detaches: 0 };
      signaling.on('offer', (event) => item.incoming.push(event));
      item.startAsInitiator = () => {
        item.starts++;
        signaling.sendOffer('fixture');
      };
      item.close = () => {
        item.closes++;
      };
      created.push(item);
      return item;
    },
    connect: (transport) => () => {
      transport.detaches++;
    },
  });
  return { mesh, receive: (event) => receive(event), sent, created, errors };
};

test('three-peer mesh routes each offer to its own connection and departure preserves the other pair', () => {
  const f = fixture();
  f.receive({ type: 'peer-joined', peerId: 'b' });
  f.receive({ type: 'offer', from: 'c', sdp: 'third peer' });
  f.receive({ type: 'offer', from: 'b', sdp: 'original peer' });
  assert.equal(f.mesh.connections.size, 2);
  assert.deepEqual(f.sent, [{ type: 'offer', sdp: 'fixture', to: 'b' }]);
  assert.deepEqual(
    f.created.map((item) => item.incoming.map((event) => event.sdp)),
    [['original peer'], ['third peer']]
  );
  f.receive({ type: 'peer-left', peerId: 'b' });
  f.receive({ type: 'peer-left', peerId: 'b' });
  assert.deepEqual(
    f.created.map((item) => [item.closes, item.detaches]),
    [
      [1, 1],
      [0, 0],
    ]
  );
  f.receive({ type: 'peer-joined', peerId: 'b-reloaded' });
  assert.equal(f.created.length, 3);
  assert.equal(f.mesh.connections.size, 2);
  f.mesh.close();
  f.mesh.close();
  f.receive({ type: 'peer-joined', peerId: 'after-close' });
  assert.equal(f.created.length, 3);
  assert.ok(
    f.created.every((item) => item.closes === 1 && item.detaches === 1)
  );
  assert.deepEqual(f.errors, []);
});

test('unsolicited answers and signals without broker provenance cannot create a connection', () => {
  const f = fixture();
  f.receive({ type: 'answer', from: 'unknown', sdp: 'late' });
  f.receive({ type: 'offer', sdp: 'unidentified' });
  assert.equal(f.created.length, 0);
  f.receive({
    type: 'ice',
    from: 'newcomer',
    candidate: { candidate: 'early' },
  });
  f.receive({ type: 'offer', from: 'newcomer', sdp: 'later' });
  assert.equal(f.created.length, 1);
  assert.equal(f.created[0].starts, 0);
  f.mesh.close();
});
