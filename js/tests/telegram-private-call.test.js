// Private calls on Telegram (R-Y196): the requests built from the machine's
// steps (messages.getDhConfig, phone.getCallConfig, requestCall,
// receivedCall, acceptCall, confirmCall, discardCall, setCallRating), the
// live link the page follows (never holding the key), Telegram's errors as
// codes, the live update hook and the routes. Fake clients; nothing reaches
// a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { createMemoryStore } from '../src/storage/universal.js';
import {
  LINK_ID,
  createPrivateCall,
  validCallId,
  validDiscard,
  validRating,
  validStart,
} from '../src/sources/telegram-private-call.js';
import { updateEffect } from '../src/sources/telegram-updates.js';
import { PRIVATE_CALL_POSTS } from '../src/server/routes-telegram-private-call.js';
import { named, helpers, telegramError } from './helpers/telegram-fakes.mjs';
import { postRoute } from './helpers/post-route.js';
import { waitFor } from './helpers/wait-for.js';

const NOW = Date.parse('2026-03-01T12:00:00Z');
const group = crypto.getDiffieHellman('modp14');

const Api = {
  messages: { GetDhConfig: named('GetDhConfig') },
  phone: {
    GetCallConfig: named('GetCallConfig'),
    RequestCall: named('RequestCall'),
    AcceptCall: named('AcceptCall'),
    ConfirmCall: named('ConfirmCall'),
    ReceivedCall: named('ReceivedCall'),
    DiscardCall: named('DiscardCall'),
    SetCallRating: named('SetCallRating'),
  },
  InputPhoneCall: named('InputPhoneCall'),
  InputUser: named('InputUser'),
  PhoneCallProtocol: named('PhoneCallProtocol'),
  PhoneCallDiscardReasonHangup: named('PhoneCallDiscardReasonHangup'),
  PhoneCallDiscardReasonMissed: named('PhoneCallDiscardReasonMissed'),
  PhoneCallDiscardReasonBusy: named('PhoneCallDiscardReasonBusy'),
  PhoneCallDiscardReasonDisconnect: named('PhoneCallDiscardReasonDisconnect'),
};

const answerFor = (request, behaviour) => {
  switch (request.className) {
    case 'GetDhConfig':
      return {
        className: 'messages.DhConfig',
        g: 2,
        p: group.getPrime(),
        version: 3,
        random: Buffer.alloc(256, 4),
      };
    case 'GetCallConfig':
      return { data: '{"call_ring_timeout_ms":50000}' };
    case 'RequestCall':
      return (
        behaviour.request?.(request) ?? {
          phoneCall: {
            className: 'PhoneCallWaiting',
            id: 55n,
            accessHash: 66n,
          },
        }
      );
    case 'DiscardCall':
      return {
        updates: [
          {
            className: 'UpdatePhoneCall',
            phoneCall: {
              className: 'PhoneCallDiscarded',
              id: 55n,
              reason: { className: 'PhoneCallDiscardReasonHangup' },
              duration: 0,
              needRating: true,
            },
          },
        ],
      };
    default:
      return behaviour.other?.(request) ?? true;
  }
};

const make = async (behaviour = {}) => {
  const log = [];
  const store = createMemoryStore();
  const client = {
    invoke: async (request) => {
      log.push(request);
      const next = answerFor(request, behaviour);
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
    getEntity: async () => ({ firstName: 'Bob', lastName: 'Ray' }),
  };
  const env = {
    store,
    now: () => NOW,
    importer: async () => ({ Api, helpers }),
    connection: {
      withPeer: async (_c, chat, use) =>
        use({ userId: BigInt(chat), accessHash: 77n }),
    },
  };
  const actions = createPrivateCall(env, { userClient: async () => client });
  return { actions, env, log, store, client };
};

const request = (log, name) => log.filter((r) => r.className === name);

test('the page bodies are validated strictly', () => {
  assert.equal(validStart({ user: '12' }), true);
  assert.equal(validStart({ user: '12', name: 'Bob' }), true);
  assert.equal(validStart({ user: '-12' }), false);
  assert.equal(validStart({ user: '12', name: 5 }), false);
  assert.equal(validCallId({ id: '55' }), true);
  assert.equal(validCallId({ id: 'x' }), false);
  assert.equal(validDiscard({ id: '55', reason: 'missed' }), true);
  assert.equal(validDiscard({ id: '55', reason: 'because' }), false);
  assert.equal(validRating({ id: '55', rating: 5 }), true);
  assert.equal(validRating({ id: '55', rating: 6 }), false);
  assert.equal(validRating({ id: '55', rating: 2.5 }), false);
  assert.equal(
    validRating({ id: '55', rating: 3, comment: 'x'.repeat(401) }),
    false
  );
});

test('Call: getDhConfig, getCallConfig, then requestCall with g_a_hash', async () => {
  const { actions, log, store } = await make();
  const done = await actions.privateCallStart({ user: '200', name: 'Bob' });
  assert.deepEqual(done, { ok: true, callId: '55' });
  const dh = request(log, 'GetDhConfig')[0];
  assert.equal(dh.version, 0);
  assert.equal(dh.randomLength, 256);
  assert.equal(request(log, 'GetCallConfig').length, 1);
  const call = request(log, 'RequestCall')[0];
  assert.equal(call.userId.className, 'InputUser');
  assert.equal(call.userId.userId, 200n);
  assert.equal(call.userId.accessHash, 77n);
  assert.equal(call.gAHash.length, 32);
  assert.equal(Number.isInteger(call.randomId), true);
  assert.equal(call.video, undefined);
  assert.equal(call.protocol.udpP2p, false);
  assert.equal(call.protocol.udpReflector, true);
  assert.deepEqual(call.protocol.libraryVersions, ['2.4.4']);
  // The link the page follows: the phase, never the key.
  const link = await store.get(LINK_ID);
  assert.equal(link.phase, 'waiting');
  assert.equal(link.out, true);
  assert.equal(link.ringMs, 50_000);
  assert.equal(link.name, 'Bob');
  assert.equal(link.media, false);
  assert.equal(link.at, new Date(NOW).toISOString());
  assert.equal(JSON.stringify(link).includes('"key"'), false);
  // The state route's source.
  assert.equal((await actions.privateCallState()).call.phase, 'waiting');
});

test('Telegram refusing the call becomes a code on the link too', async () => {
  const { actions, store } = await make({
    request: () => telegramError('USER_PRIVACY_RESTRICTED'),
  });
  const done = await actions.privateCallStart({ user: '200' });
  assert.deepEqual(done, {
    ok: false,
    error: 'USER_PRIVACY_RESTRICTED',
    code: 'privacy',
  });
  const link = await store.get(LINK_ID);
  assert.equal(link.phase, 'ended');
  assert.equal(link.reason, 'failed');
  assert.equal(link.code, 'privacy');
});

test('an incoming call: receivedCall at once, acceptCall only on Accept', async () => {
  const { env, log, store } = await make();
  const effect = updateEffect({
    className: 'UpdatePhoneCall',
    phoneCall: {
      className: 'PhoneCallRequested',
      id: 88n,
      accessHash: 99n,
      date: Math.floor(NOW / 1000),
      adminId: 321n,
      participantId: 1n,
      gAHash: Buffer.alloc(32, 1),
      protocol: {},
    },
    _entities: new Map([['321', { firstName: 'Ann', lastName: 'Lee' }]]),
  });
  assert.equal(effect.kind, 'phone-call');
  await env.phoneCalls.handle(
    { invoke: (r) => (log.push(r), Promise.resolve(true)) },
    effect
  );
  const link = await store.get(LINK_ID);
  assert.equal(link.phase, 'incoming');
  assert.equal(link.name, 'Ann Lee');
  assert.equal(link.user, '321');
  const received = request(log, 'ReceivedCall')[0];
  assert.equal(received.peer.id, 88n);
  assert.equal(received.peer.accessHash, 99n);
  // Ringing alone sends no DH value and accepts nothing.
  assert.equal(request(log, 'AcceptCall').length, 0);
  assert.equal(request(log, 'GetDhConfig').length, 0);
});

test('Accept sends g_b; Decline discards as a hangup with the duration', async () => {
  const { actions, env, log } = await make({
    other: (r) =>
      r.className === 'AcceptCall'
        ? { phoneCall: { className: 'PhoneCallWaiting', id: 88n } }
        : true,
  });
  await env.phoneCalls.handle(
    { invoke: async () => true },
    updateEffect({
      className: 'UpdatePhoneCall',
      phoneCall: {
        className: 'PhoneCallRequested',
        id: 88n,
        accessHash: 99n,
        date: Math.floor(NOW / 1000),
        adminId: 321n,
        gAHash: Buffer.alloc(32, 1),
      },
    })
  );
  const accepted = await actions.privateCallAccept({ id: '88' });
  assert.deepEqual(accepted, { ok: true, callId: '88' });
  const accept = request(log, 'AcceptCall')[0];
  assert.equal(accept.gB.length, 256);
  assert.equal(accept.peer.id, 88n);
  assert.equal(accept.protocol.udpP2p, false);
  // Ending it: discardCall with the reason and a connection id of 0.
  const ended = await actions.privateCallDiscard({ id: '88' });
  assert.equal(ended.ok, true);
  const discard = request(log, 'DiscardCall')[0];
  assert.equal(discard.reason.className, 'PhoneCallDiscardReasonHangup');
  assert.equal(discard.connectionId, 0n);
  assert.equal(discard.duration, 0);
  assert.equal(discard.peer.accessHash, 99n);
});

test('a call that is not there: no request, a code', async () => {
  const { actions, log } = await make();
  assert.deepEqual(await actions.privateCallAccept({ id: '1' }), {
    ok: false,
    error: 'no-call',
    code: 'no-call',
  });
  assert.equal((await actions.privateCallDiscard({ id: '1' })).code, 'no-call');
  assert.equal(
    (await actions.privateCallRate({ id: '1', rating: 5 })).code,
    'no-call'
  );
  assert.equal((await actions.privateCallStart({ user: 'x' })).code, 'failed');
  assert.equal(log.length, 0);
});

test('rating after the call: setCallRating with a user-initiated flag', async () => {
  const { actions, log } = await make();
  await actions.privateCallStart({ user: '200' });
  await actions.privateCallDiscard({ id: '55', reason: 'missed' });
  const discard = request(log, 'DiscardCall')[0];
  assert.equal(discard.reason.className, 'PhoneCallDiscardReasonMissed');
  const rated = await actions.privateCallRate({
    id: '55',
    rating: 2,
    comment: 'crackly',
  });
  assert.deepEqual(rated, { ok: true });
  const sent = request(log, 'SetCallRating')[0];
  assert.equal(sent.rating, 2);
  assert.equal(sent.comment, 'crackly');
  assert.equal(sent.userInitiative, true);
  assert.equal(sent.peer.id, 55n);
});

test('a call left over from before a restart is ended at startup', async () => {
  const store = createMemoryStore();
  await store.put({ id: LINK_ID, phase: 'active', out: true, at: 'x' });
  createPrivateCall(
    { store, now: () => NOW, importer: async () => ({ Api, helpers }) },
    { userClient: async () => null }
  );
  await waitFor(async () => (await store.get(LINK_ID)).phase === 'ended', {
    what: 'the left-over call to end',
  });
  const link = await store.get(LINK_ID);
  assert.equal(link.phase, 'ended');
  assert.equal(link.code, 'restart');
});

test('UpdatePhoneCall becomes an effect; signalling data is dropped', () => {
  const pc = { className: 'PhoneCallDiscarded', id: 1n };
  const effect = updateEffect({ className: 'UpdatePhoneCall', phoneCall: pc });
  assert.equal(effect.kind, 'phone-call');
  assert.equal(effect.phoneCall, pc);
  assert.equal(
    updateEffect({
      className: 'UpdatePhoneCallSignalingData',
      phoneCallId: 1n,
      data: Buffer.alloc(3),
    }),
    null
  );
});

// ---- the routes ----------------------------------------------------------

const fakeAccount = () => {
  const calls = [];
  const take = (name) => async (body) => {
    calls.push([name, body]);
    return { ok: true };
  };
  return {
    calls,
    privateCallStart: take('start'),
    privateCallAccept: take('accept'),
    privateCallDiscard: take('discard'),
    privateCallRate: take('rate'),
    privateCallState: take('state'),
  };
};

test('routes: each is registered and validated before the account is asked', async () => {
  assert.deepEqual(Object.keys(PRIVATE_CALL_POSTS).sort(), [
    'private-call-accept',
    'private-call-discard',
    'private-call-rate',
    'private-call-start',
    'private-call-state',
  ]);
  const account = fakeAccount();
  const good = [
    ['private-call-start', { user: '200', name: 'Bob' }],
    ['private-call-accept', { id: '88' }],
    ['private-call-discard', { id: '88', reason: 'busy' }],
    ['private-call-rate', { id: '88', rating: 5, comment: 'fine' }],
    ['private-call-state', {}],
  ];
  for (const [route, body] of good) {
    assert.equal(await postRoute(route, body, account), 200, route);
  }
  assert.equal(account.calls.length, 5);
  const bad = [
    ['private-call-start', {}],
    ['private-call-start', { user: 'x' }],
    ['private-call-accept', { id: 5 }],
    ['private-call-accept', {}],
    ['private-call-discard', { id: '88', reason: 'rage' }],
    ['private-call-rate', { id: '88', rating: 0 }],
    ['private-call-rate', { id: '88', rating: 5, comment: 7 }],
    ['private-call-state', { x: 1 }],
  ];
  for (const [route, body] of bad) {
    assert.equal(
      await postRoute(route, body, account),
      400,
      `${route} ${JSON.stringify(body)}`
    );
  }
  assert.equal(account.calls.length, 5);
  // An account without calls: a plain bad request, never a crash.
  assert.equal(await postRoute('private-call-start', { user: '200' }, {}), 400);
});
