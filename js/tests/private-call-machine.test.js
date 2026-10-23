// The private call's state machine (R-Y196): a caller and a callee, each
// with its own machine, talk through a fake Telegram that relays what
// phone.requestCall, acceptCall, confirmCall and discardCall carry. The
// key, the checks, the phases and the views are all tested; nothing
// reaches a network. The clock is fixed and passed everywhere.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { bigOf, bytesOf } from '../src/sources/private-call-dh.js';
import {
  DEFAULT_RING_MS,
  PROTOCOL,
  createCallMachine,
  phoneCallOf,
  ringMsOf,
} from '../src/sources/private-call-machine.js';

const NOW = Date.parse('2026-03-01T12:00:00Z');
const group = crypto.getDiffieHellman('modp14');
const CONFIG = {
  g: group.getGenerator()[0],
  p: group.getPrime(),
  version: 1,
  random: Buffer.alloc(256, 9),
};
const A = bigOf(bytesOf((1n << 2000n) + 0x1234567890abcdefn));
const B = bigOf(bytesOf((1n << 2040n) + 0xfedcba0987654321n));
const ID = 700n;
const HASH = 5n;

const reasonOf = (name) => ({ className: `PhoneCallDiscardReason${name}` });

// Two machines and the Telegram between them.
const world = ({ config = CONFIG, requestFails = null } = {}) => {
  let clock = NOW;
  const now = () => clock;
  const pending = [];
  const log = [];
  const sides = {};
  const send = (to, pc) =>
    pending.push(sides[to].machine.onUpdate(sides[to].api, pc));
  const drain = async () => {
    while (pending.length > 0) {
      await pending.shift();
    }
  };
  const held = {};

  const apiOf = (me, other) => ({
    dhConfig: async () => config,
    callConfig: async () => ({
      data: JSON.stringify({ call_ring_timeout_ms: 45_000 }),
    }),
    request: async ({ user, gaHash, video }) => {
      log.push(['request', me, { user, video }]);
      if (requestFails) {
        throw requestFails;
      }
      send(other, {
        className: 'PhoneCallRequested',
        id: ID,
        accessHash: HASH,
        date: Math.floor(clock / 1000),
        adminId: 100n,
        participantId: 200n,
        gAHash: gaHash,
        protocol: PROTOCOL,
      });
      return {
        phoneCall: { className: 'PhoneCallWaiting', id: ID, accessHash: HASH },
      };
    },
    received: async () => log.push(['received', me]),
    accept: async ({ gb }) => {
      log.push(['accept', me]);
      held.gb = gb;
      send(other, {
        className: 'PhoneCallAccepted',
        id: ID,
        accessHash: HASH,
        gB: gb,
      });
      return { phoneCall: { className: 'PhoneCallWaiting', id: ID } };
    },
    confirm: async ({ ga, fingerprint }) => {
      log.push(['confirm', me, fingerprint]);
      const full = (g) => ({
        className: 'PhoneCall',
        id: ID,
        accessHash: HASH,
        gAOrB: g,
        keyFingerprint: BigInt(held.wrongFingerprint ?? fingerprint),
        connections: [
          { className: 'PhoneConnection' },
          { className: 'PhoneConnectionWebrtc', turn: true },
          { className: 'PhoneConnectionWebrtc', stun: true },
        ],
      });
      send(other, full(held.wrongGa ?? ga));
      return { phoneCall: full(held.gb) };
    },
    discard: async (args) => {
      log.push(['discard', me, args.reason, args.duration]);
      const gone = {
        className: 'PhoneCallDiscarded',
        id: ID,
        reason: reasonOf(
          { missed: 'Missed', busy: 'Busy', disconnect: 'Disconnect' }[
            args.reason
          ] ?? 'Hangup'
        ),
        duration: args.duration,
        needRating: true,
      };
      send(other, gone);
      return { updates: [{ className: 'UpdatePhoneCall', phoneCall: gone }] };
    },
    rate: async (args) => log.push(['rate', me, args.rating, args.comment]),
    nameOf: async (user) => `User ${user}`,
  });

  const side = (name, other, exponent) => {
    const views = [];
    const machine = createCallMachine({
      now,
      exponent: () => exponent,
      publish: async (view) => views.push({ ...view, emoji: [...view.emoji] }),
      codeOf: (error) => (/PRIVACY/.test(error.message) ? 'privacy' : 'failed'),
    });
    sides[name] = { machine, api: apiOf(name, other), views };
    return sides[name];
  };
  side('caller', 'callee', A);
  side('callee', 'caller', B);
  return {
    caller: sides.caller,
    callee: sides.callee,
    drain,
    log,
    held,
    tick: (ms) => {
      clock += ms;
    },
  };
};

const phases = (side) => side.views.map((v) => v.phase);

test('a call from start to rating: both sides agree on the key', async () => {
  const w = world();
  const started = await w.caller.machine.start(w.caller.api, {
    user: '200',
    name: 'Bob',
  });
  assert.deepEqual(started, { ok: true, callId: '700' });
  await w.drain();
  // The caller waits; the callee is told (and answers receivedCall).
  assert.equal(w.caller.views.at(-1).phase, 'waiting');
  assert.equal(w.caller.views.at(-1).ringMs, 45_000);
  assert.equal(w.callee.machine.view().phase, 'incoming');
  assert.equal(w.callee.machine.view().name, 'User 100');
  assert.equal(w.callee.machine.view().user, '100');
  assert.ok(w.log.some(([n, who]) => n === 'received' && who === 'callee'));

  // The callee accepts: g_b, then g_a, then both are active.
  assert.deepEqual(await w.callee.machine.accept(w.callee.api, { id: '700' }), {
    ok: true,
    callId: '700',
  });
  await w.drain();
  const a = w.caller.machine.view();
  const b = w.callee.machine.view();
  assert.equal(a.phase, 'active');
  assert.equal(b.phase, 'active');
  assert.equal(a.emoji.length, 4);
  assert.deepEqual(a.emoji, b.emoji);
  assert.equal(a.webrtc, 2);
  assert.equal(a.media, false);
  assert.ok(phases(w.caller).includes('connecting'));
  assert.ok(phases(w.callee).includes('connecting'));
  assert.equal(a.startedAt, NOW);

  // Nothing secret is in any published view.
  const secret = ['key', 'a', 'b', 'ga', 'gb', 'fingerprint', 'config'];
  for (const view of [...w.caller.views, ...w.callee.views]) {
    assert.deepEqual(
      Object.keys(view).filter((k) => secret.includes(k)),
      []
    );
  }

  // The caller ends it after 65 seconds.
  w.tick(65_000);
  const ended = await w.caller.machine.discard(w.caller.api, { id: '700' });
  await w.drain();
  assert.deepEqual(ended, { ok: true, duration: 65 });
  assert.ok(
    w.log.some((e) => e[0] === 'discard' && e[2] === 'hangup' && e[3] === 65)
  );
  const last = w.caller.machine.view();
  assert.equal(last.phase, 'ended');
  assert.equal(last.reason, 'hangup');
  assert.equal(last.duration, 65);
  assert.equal(last.needRating, true);
  assert.equal(w.callee.machine.view().phase, 'ended');

  // The rating follows, once.
  assert.deepEqual(
    await w.caller.machine.rate(w.caller.api, {
      id: '700',
      rating: 4,
      comment: 'ok',
    }),
    { ok: true }
  );
  assert.ok(w.log.some((e) => e[0] === 'rate' && e[2] === 4 && e[3] === 'ok'));
  assert.equal(w.caller.machine.view().needRating, false);
});

test('the other device ringing is a phase of its own', async () => {
  const w = world();
  await w.caller.machine.start(w.caller.api, { user: '200' });
  await w.caller.machine.onUpdate(w.caller.api, {
    className: 'PhoneCallWaiting',
    id: ID,
    accessHash: HASH,
    receiveDate: 1,
  });
  assert.equal(w.caller.machine.view().phase, 'ringing');
});

test('declining a ringing call discards it as a hangup', async () => {
  const w = world();
  await w.caller.machine.start(w.caller.api, { user: '200' });
  await w.drain();
  const done = await w.callee.machine.discard(w.callee.api, { id: '700' });
  await w.drain();
  assert.equal(done.ok, true);
  assert.ok(
    w.log.some(
      (e) => e[0] === 'discard' && e[1] === 'callee' && e[2] === 'hangup'
    )
  );
  assert.equal(w.callee.machine.view().phase, 'ended');
  assert.equal(w.caller.machine.view().phase, 'ended');
  assert.equal(w.caller.machine.view().connected, false);
});

test('an unanswered call ends as missed (the ring timeout)', async () => {
  const w = world();
  await w.caller.machine.start(w.caller.api, { user: '200' });
  await w.drain();
  await w.caller.machine.discard(w.caller.api, { id: '700', reason: 'missed' });
  await w.drain();
  assert.equal(w.caller.machine.view().reason, 'missed');
  assert.ok(w.log.some((e) => e[0] === 'discard' && e[2] === 'missed'));
  // An unknown reason is a hangup.
  const v = world();
  await v.caller.machine.start(v.caller.api, { user: '200' });
  await v.caller.machine.discard(v.caller.api, { reason: 'weird' });
  assert.ok(v.log.some((e) => e[0] === 'discard' && e[2] === 'hangup'));
});

test('a second call is refused while one is on; a second ring is busy', async () => {
  const w = world();
  await w.caller.machine.start(w.caller.api, { user: '200' });
  await w.drain();
  assert.deepEqual(
    await w.caller.machine.start(w.caller.api, { user: '300' }),
    { ok: false, code: 'busy' }
  );
  // Another request reaches the callee, who is already ringing.
  await w.callee.machine.onUpdate(w.callee.api, {
    className: 'PhoneCallRequested',
    id: 999n,
    accessHash: 1n,
    date: Math.floor(NOW / 1000),
    adminId: 300n,
    gAHash: Buffer.alloc(32),
  });
  assert.ok(
    w.log.some(
      (e) => e[0] === 'discard' && e[1] === 'callee' && e[2] === 'busy'
    )
  );
  assert.equal(w.callee.machine.view().callId, '700');
});

test('a request replayed long after it was made does not ring', async () => {
  const w = world();
  await w.callee.machine.onUpdate(w.callee.api, {
    className: 'PhoneCallRequested',
    id: 1n,
    accessHash: 1n,
    date: Math.floor(NOW / 1000) - 600,
    adminId: 300n,
    gAHash: Buffer.alloc(32),
  });
  assert.equal(w.callee.machine.view(), null);
});

test('a g_a that is not the promised one ends the call (g_a_hash)', async () => {
  const w = world();
  w.held.wrongGa = Buffer.alloc(256, 0x42);
  await w.caller.machine.start(w.caller.api, { user: '200' });
  await w.drain();
  await w.callee.machine.accept(w.callee.api, { id: '700' });
  await w.drain();
  const b = w.callee.machine.view();
  assert.equal(b.phase, 'ended');
  assert.equal(b.reason, 'failed');
  assert.equal(b.code, 'dh-hash');
  assert.equal(b.emoji.length, 0);
  assert.ok(
    w.log.some(
      (e) => e[0] === 'discard' && e[1] === 'callee' && e[2] === 'disconnect'
    )
  );
});

test('a wrong key fingerprint ends the call', async () => {
  const w = world();
  w.held.wrongFingerprint = '12345';
  await w.caller.machine.start(w.caller.api, { user: '200' });
  await w.drain();
  await w.callee.machine.accept(w.callee.api, { id: '700' });
  await w.drain();
  const codes = [w.caller.machine.view(), w.callee.machine.view()].map(
    (v) => `${v.phase}:${v.code}`
  );
  assert.deepEqual(codes.sort(), ['ended:fingerprint', 'ended:fingerprint']);
});

test('unsafe DH parameters stop a call before it is placed', async () => {
  const w = world({ config: { ...CONFIG, p: Buffer.from('0b', 'hex') } });
  const done = await w.caller.machine.start(w.caller.api, { user: '200' });
  assert.deepEqual(done, { ok: false, code: 'dh-config' });
  assert.equal(w.caller.machine.view().phase, 'ended');
  assert.equal(w.log.filter((e) => e[0] === 'request').length, 0);
});

test('Telegram refusing the request ends the call with its code', async () => {
  const w = world({ requestFails: new Error('USER_PRIVACY_RESTRICTED') });
  await assert.rejects(
    w.caller.machine.start(w.caller.api, { user: '200' }),
    /PRIVACY/
  );
  const view = w.caller.machine.view();
  assert.equal(view.phase, 'ended');
  assert.equal(view.reason, 'failed');
  assert.equal(view.code, 'privacy');
  // A new call may follow.
  const again = world();
  assert.equal(
    (await again.caller.machine.start(again.caller.api, { user: '200' })).ok,
    true
  );
});

test('commands for a call that is not there answer no-call', async () => {
  const w = world();
  assert.deepEqual(await w.caller.machine.discard(w.caller.api, {}), {
    ok: false,
    code: 'no-call',
  });
  assert.deepEqual(await w.callee.machine.accept(w.callee.api, { id: '1' }), {
    ok: false,
    code: 'no-call',
  });
  assert.deepEqual(
    await w.caller.machine.rate(w.caller.api, { id: '1', rating: 5 }),
    { ok: false, code: 'no-call' }
  );
  // Updates for another call change nothing.
  await w.caller.machine.start(w.caller.api, { user: '200' });
  await w.caller.machine.onUpdate(w.caller.api, {
    className: 'PhoneCallDiscarded',
    id: 31337n,
    reason: reasonOf('Hangup'),
  });
  assert.equal(w.caller.machine.view().phase, 'waiting');
  // A call that is still going cannot be rated.
  assert.deepEqual(
    await w.caller.machine.rate(w.caller.api, { id: '700', rating: 5 }),
    { ok: false, code: 'no-call' }
  );
});

test('Telegram ending the call (the other side hung up)', async () => {
  const w = world();
  await w.caller.machine.start(w.caller.api, { user: '200' });
  await w.drain();
  await w.callee.machine.accept(w.callee.api, { id: '700' });
  await w.drain();
  await w.caller.machine.onUpdate(w.caller.api, {
    className: 'PhoneCallDiscarded',
    id: ID,
    reason: reasonOf('Disconnect'),
    duration: 12,
    needRating: true,
  });
  const view = w.caller.machine.view();
  assert.equal(view.phase, 'ended');
  assert.equal(view.reason, 'disconnect');
  assert.equal(view.duration, 12);
  assert.equal(view.connected, true);
});

test('answers of Telegram are read for their phone call', () => {
  const pc = { className: 'PhoneCallWaiting' };
  assert.equal(phoneCallOf({ phoneCall: pc }), pc);
  assert.equal(phoneCallOf({ update: { phoneCall: pc } }), pc);
  assert.equal(
    phoneCallOf({
      updates: [
        { className: 'UpdateX' },
        { className: 'UpdatePhoneCall', phoneCall: pc },
      ],
    }),
    pc
  );
  assert.equal(phoneCallOf({ updates: [] }), null);
  assert.equal(phoneCallOf(null), null);
});

test('the ring timeout comes from the call config, within bounds', () => {
  assert.equal(ringMsOf({ data: '{"call_ring_timeout_ms":60000}' }), 60_000);
  assert.equal(
    ringMsOf({ data: '{"call_ring_timeout_ms":10}' }),
    DEFAULT_RING_MS
  );
  assert.equal(ringMsOf({ data: 'nope' }), DEFAULT_RING_MS);
  assert.equal(ringMsOf(null), DEFAULT_RING_MS);
});

test('the protocol we announce: no p2p, a placeholder library', () => {
  assert.equal(PROTOCOL.udpP2p, false);
  assert.equal(PROTOCOL.udpReflector, true);
  assert.ok(PROTOCOL.minLayer <= PROTOCOL.maxLayer);
  assert.ok(PROTOCOL.libraryVersions.length > 0);
});
