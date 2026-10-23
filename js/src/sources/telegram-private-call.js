/**
 * Private (one-to-one) voice calls, as Telegram's clients place and take
 * them (R-Y196; learned, never copied). Nothing rings, dials or asks for
 * the microphone by itself: every write below answers a click, except
 * answering Telegram's own updates (receivedCall, the DH steps).
 *
 * The call's state machine and its Diffie-Hellman key stay on the server
 * (./private-call-machine.js, ./private-call-dh.js); the page reads the
 * view of the call from the link `phonecall:telegram` (streamed like the
 * other live links) and only ever sees the emoji of the key.
 *
 * - `privateCallStart({ user, name? })` — "Call" in a private chat's
 *   header: phone.getCallConfig, messages.getDhConfig, phone.requestCall
 *   with g_a_hash → `{ ok, callId }`;
 * - `privateCallAccept({ id })` — Accept: phone.receivedCall already
 *   answered when it rang; now messages.getDhConfig and phone.acceptCall
 *   with g_b;
 * - `privateCallDiscard({ id, reason? })` — Decline / End / ring timeout:
 *   phone.discardCall with the duration and the reason (hangup, missed,
 *   busy, disconnect);
 * - `privateCallRate({ id, rating, comment? })` — phone.setCallRating
 *   after the call (1 to 5);
 * - `privateCallState()` — the call's view now or null;
 * - `phoneCalls.handle(client, effect)` (internal) — UpdatePhoneCall from
 *   the live handler drives the machine (the update's phoneCallRequested /
 *   phoneCallWaiting / phoneCallAccepted / phoneCall / phoneCallDiscarded);
 *   UpdatePhoneCallSignalingData is read and dropped.
 * Media is not done (see ./private-call-machine.js): the view says
 * `media: false`, and the PhoneConnectionWebrtc servers are only counted.
 * Telegram's errors become codes the page shows as text.
 */

import crypto from 'node:crypto';
import { connected, failureOf } from './telegram-stickers.js';
import { inputUserOf } from './telegram-peer-actions.js';
import {
  createCallMachine,
  DISCARD_REASONS,
  PROTOCOL,
} from './private-call-machine.js';

const CODES = {
  USER_PRIVACY_RESTRICTED: 'privacy',
  USER_IS_BLOCKED: 'blocked',
  PARTICIPANT_VERSION_OUTDATED: 'outdated',
  CALL_PROTOCOL_LAYER_INVALID: 'outdated',
  CALL_PROTOCOL_FLAGS_INVALID: 'outdated',
  CALL_ALREADY_ACCEPTED: 'answered',
  CALL_ALREADY_DECLINED: 'gone',
  CALL_PEER_INVALID: 'gone',
  CALL_OCCUPY_FAILED: 'busy',
  USER_ID_INVALID: 'no-access',
  PEER_ID_INVALID: 'no-access',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);
const codeOf = (error) => failure(error).code;
const bad = () => ({ ok: false, error: 'bad request', code: 'failed' });

export const LINK_ID = 'phonecall:telegram';

const DIGITS = /^\d{1,20}$/;
const text = (value) => String(value ?? '');

/** Whether a body names a call: its id as digits. */
export const validCallId = (body) =>
  typeof body?.id === 'string' && DIGITS.test(body.id);

export const validStart = (body) =>
  typeof body?.user === 'string' &&
  DIGITS.test(body.user) &&
  (body.name === undefined ||
    (typeof body.name === 'string' && body.name.length <= 200));

export const validDiscard = (body) =>
  validCallId(body) &&
  (body.reason === undefined || DISCARD_REASONS.includes(body.reason));

export const validRating = (body) =>
  validCallId(body) &&
  Number.isInteger(body.rating) &&
  body.rating >= 1 &&
  body.rating <= 5 &&
  (body.comment === undefined ||
    (typeof body.comment === 'string' && body.comment.length <= 400));

const REASON_CLASS = {
  hangup: 'PhoneCallDiscardReasonHangup',
  missed: 'PhoneCallDiscardReasonMissed',
  busy: 'PhoneCallDiscardReasonBusy',
  disconnect: 'PhoneCallDiscardReasonDisconnect',
};

const nameOf = (entity) =>
  [entity?.firstName, entity?.lastName].filter(Boolean).join(' ') ||
  entity?.username ||
  '';

/** The machine's `api` for one connected client (and the update's users). */
export const apiOf = (env, c, entities = null) => {
  const big = (value) => c.helpers.returnBigInt(text(value));
  const peer = ({ id, accessHash }) =>
    new c.Api.InputPhoneCall({ id: big(id), accessHash: big(accessHash) });
  const protocol = () => new c.Api.PhoneCallProtocol({ ...PROTOCOL });
  const call = (request) => c.client.invoke(request);
  return {
    dhConfig: async () => {
      const answer = await call(
        new c.Api.messages.GetDhConfig({ version: 0, randomLength: 256 })
      );
      return {
        g: answer.g,
        p: answer.p,
        version: answer.version,
        random: answer.random,
      };
    },
    callConfig: () => call(new c.Api.phone.GetCallConfig()),
    request: async ({ user, gaHash, video }) =>
      call(
        new c.Api.phone.RequestCall({
          userId: await env.connection.withPeer(c.client, user, (p) =>
            inputUserOf(c, p)
          ),
          randomId: crypto.randomInt(-(2 ** 31), 2 ** 31),
          gAHash: gaHash,
          protocol: protocol(),
          ...(video ? { video: true } : {}),
        })
      ),
    accept: (args) =>
      call(
        new c.Api.phone.AcceptCall({
          peer: peer(args),
          gB: args.gb,
          protocol: protocol(),
        })
      ),
    confirm: (args) =>
      call(
        new c.Api.phone.ConfirmCall({
          peer: peer(args),
          gA: args.ga,
          keyFingerprint: big(args.fingerprint),
          protocol: protocol(),
        })
      ),
    received: (args) =>
      call(new c.Api.phone.ReceivedCall({ peer: peer(args) })),
    discard: (args) =>
      call(
        new c.Api.phone.DiscardCall({
          peer: peer(args),
          duration: Number(args.duration) || 0,
          reason: new c.Api[REASON_CLASS[args.reason] ?? REASON_CLASS.hangup](),
          connectionId: c.zero,
        })
      ),
    rate: (args) =>
      call(
        new c.Api.phone.SetCallRating({
          userInitiative: true,
          peer: peer(args),
          rating: args.rating,
          comment: text(args.comment),
        })
      ),
    nameOf: async (user) => {
      const known = entities?.get?.(text(user));
      if (known) {
        return nameOf(known);
      }
      try {
        return nameOf(await c.client.getEntity(big(user)));
      } catch {
        return '';
      }
    },
  };
};

// The call's view as a link the page follows.
const writer = (env) => async (view) => {
  await env.store.put({
    id: LINK_ID,
    tokens: ['phonecall', 'telegram'],
    kind: 'phone-call',
    source: 'telegram',
    ...view,
    at: new Date((env.now ?? Date.now)()).toISOString(),
  });
};

// A call left over from before a restart is over.
const closeStale = async (env, publish) => {
  const before = await env.store.get(LINK_ID).catch(() => null);
  if (before && before.phase !== 'ended') {
    await publish({
      ...before,
      phase: 'ended',
      reason: 'failed',
      code: 'restart',
      needRating: false,
      endedAt: (env.now ?? Date.now)(),
    });
  }
};

export const createPrivateCall = (env, { userClient }) => {
  const publish = writer(env);
  const machine = createCallMachine({
    now: env.now ?? Date.now,
    publish,
    codeOf,
  });
  closeStale(env, publish).catch(() => {});

  const run = (use) => connected(env, userClient, failure, use);
  const done = (answer) =>
    answer.ok ? answer : { ok: false, error: answer.code, code: answer.code };

  // UpdatePhoneCall of the live handler.
  env.phoneCalls = {
    handle: async (client, effect) => {
      const { Api, helpers } = await env.importer();
      const c = { client, Api, helpers, zero: helpers.returnBigInt(0) };
      await machine.onUpdate(apiOf(env, c, effect.entities), effect.phoneCall);
    },
  };

  const privateCallStart = async (body = {}) =>
    validStart(body)
      ? run(async (c) =>
          done(
            await machine.start(apiOf(env, c), {
              user: body.user,
              name: body.name,
            })
          )
        )
      : bad();

  const privateCallAccept = async (body = {}) =>
    validCallId(body)
      ? run(async (c) => done(await machine.accept(apiOf(env, c), body)))
      : bad();

  const privateCallDiscard = async (body = {}) =>
    validDiscard(body)
      ? run(async (c) => done(await machine.discard(apiOf(env, c), body)))
      : bad();

  const privateCallRate = async (body = {}) =>
    validRating(body)
      ? run(async (c) => done(await machine.rate(apiOf(env, c), body)))
      : bad();

  const privateCallState = async () => ({ ok: true, call: machine.view() });

  return {
    privateCallStart,
    privateCallAccept,
    privateCallDiscard,
    privateCallRate,
    privateCallState,
  };
};
