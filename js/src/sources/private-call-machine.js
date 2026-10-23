/**
 * The state machine of one private (one-to-one) call (R-Y196; learned from
 * how Telegram's clients behave, never copied). It is driven by what the
 * page asks (start, accept, discard, rate) and by UpdatePhoneCall, and it
 * talks to Telegram only through the `api` it is handed, so the tests give
 * it a fake. The secret exponent and the key live in here and nowhere else:
 * `publish` only ever gets the page's view of the call.
 *
 * Phases of the view:
 *   incoming    somebody calls us (Accept / Decline)
 *   waiting     we called; Telegram has not told the other side yet
 *   ringing     we called; the other side's phone rings
 *   connecting  keys are being exchanged
 *   active      the key is agreed and its fingerprint checked
 *   ended       over (`reason`: hangup, missed, busy, disconnect, failed,
 *               migrate; `needRating` when Telegram asks for a rating)
 *
 * Media: only the call's key and its signalling are done here. A browser
 * cannot speak tgcalls' own encrypted transport, and the encrypted
 * signalling envelope of the WebRTC variant could not be settled with
 * confidence, so `media` stays false and the page says audio is not
 * available. Nothing is sent through phone.sendSignalingData.
 */

import {
  checkDhConfig,
  exponentOf,
  fingerprintOf,
  hashOf,
  publicInRange,
  publicOf,
  sharedKey,
} from './private-call-dh.js';
import { emojiOf } from './private-call-emoji.js';

// What we announce. Nothing in a browser speaks a tgcalls library, so the
// version is a placeholder the other side may or may not accept, and
// direct (p2p) connections are never offered.
export const LIBRARY_VERSIONS = Object.freeze(['2.4.4']);
export const PROTOCOL = Object.freeze({
  udpP2p: false,
  udpReflector: true,
  minLayer: 65,
  maxLayer: 92,
  libraryVersions: LIBRARY_VERSIONS,
});

/** The reasons the page may give when it ends a call. */
export const DISCARD_REASONS = Object.freeze([
  'hangup',
  'missed',
  'busy',
  'disconnect',
]);

const REASON_OF = {
  PhoneCallDiscardReasonMissed: 'missed',
  PhoneCallDiscardReasonDisconnect: 'disconnect',
  PhoneCallDiscardReasonHangup: 'hangup',
  PhoneCallDiscardReasonBusy: 'busy',
  PhoneCallDiscardReasonMigrateConferenceCall: 'migrate',
};

export const DEFAULT_RING_MS = 90_000;
const STALE_SECONDS = 120;
const text = (value) => String(value ?? '');

/** The phone call inside an Updates answer (or a phone.PhoneCall). */
export const phoneCallOf = (answer) => {
  if (answer?.phoneCall) {
    return answer.phoneCall;
  }
  if (answer?.update?.phoneCall) {
    return answer.update.phoneCall;
  }
  const found = (answer?.updates ?? []).find(
    (u) => u?.className === 'UpdatePhoneCall'
  );
  return found?.phoneCall ?? null;
};

/** The ring timeout out of phone.getCallConfig's JSON, in milliseconds. */
export const ringMsOf = (config) => {
  try {
    const value = Number(JSON.parse(config?.data ?? '{}').call_ring_timeout_ms);
    return value >= 5000 && value <= 300_000 ? value : DEFAULT_RING_MS;
  } catch {
    return DEFAULT_RING_MS;
  }
};

const ended = (session) => !session || session.view.phase === 'ended';

// The call being held (or the last one), its view, and what is published.
const createHolder = ({ now, publish }) => {
  const held = { session: null };
  let rev = 0;
  let count = 0;

  const show = async (patch) => {
    rev += 1;
    held.session.view = { ...held.session.view, ...patch, rev };
    await publish(held.session.view);
  };

  const peerOf = () => ({
    id: held.session.id,
    accessHash: held.session.accessHash,
  });

  const finish = async (reason, extra = {}) => {
    const { session } = held;
    const { startedAt } = session.view;
    const duration =
      extra.duration ??
      (startedAt ? Math.max(0, Math.round((now() - startedAt) / 1000)) : 0);
    // The secrets go the moment the call is over.
    Object.assign(session, { a: null, b: null, key: null });
    await show({
      phase: 'ended',
      endedAt: now(),
      reason,
      duration,
      needRating: extra.needRating === true,
      ...(extra.code ? { code: extra.code } : {}),
    });
  };

  // A call that cannot go on: tell Telegram, then end it here.
  const abort = async (api, reason, code) => {
    if (held.session.id) {
      await api
        .discard({ ...peerOf(), duration: 0, reason: 'disconnect' })
        .catch(() => {});
    }
    await finish(reason, { code });
  };

  const newView = (patch) => ({
    // Tells this call from the one before it (the id comes later).
    ref: `${now()}-${(count += 1)}`,
    callId: null,
    phase: 'waiting',
    out: true,
    user: '',
    name: '',
    video: false,
    emoji: [],
    startedAt: 0,
    connected: false,
    media: false,
    webrtc: 0,
    ringMs: DEFAULT_RING_MS,
    needRating: false,
    ...patch,
  });

  return { held, show, peerOf, finish, abort, newView };
};

// What each kind of PhoneCall does to the held call.
const createSteps = (holder, { now }) => {
  const { held, show, peerOf, finish, abort, newView } = holder;

  // Telegram's DH parameters, checked, or null.
  const configOf = async (api) => {
    const config = await api.dhConfig();
    return checkDhConfig(config).ok ? config : null;
  };

  const onRequested = async (api, pc) => {
    // A request replayed after a reconnect must not ring.
    if (pc.date && now() / 1000 - Number(pc.date) > STALE_SECONDS) {
      return;
    }
    if (!ended(held.session)) {
      await api
        .discard({
          id: text(pc.id),
          accessHash: text(pc.accessHash),
          reason: 'busy',
        })
        .catch(() => {});
      return;
    }
    const user = text(pc.adminId);
    held.session = {
      id: text(pc.id),
      accessHash: text(pc.accessHash),
      out: false,
      gaHash: Buffer.from(pc.gAHash ?? []),
      view: newView({
        callId: text(pc.id),
        phase: 'incoming',
        out: false,
        user,
        name: (await api.nameOf?.(user)) ?? '',
        video: pc.video === true,
      }),
    };
    await show({});
    // Telegram stops resending the request once it knows we have it.
    await api.received(peerOf()).catch(() => {});
  };

  const onWaiting = async (pc) => {
    const { session } = held;
    if (!session?.out || ended(session)) {
      return;
    }
    session.id ??= text(pc.id);
    session.accessHash ??= text(pc.accessHash);
    if (session.view.phase === 'waiting' || session.view.phase === 'ringing') {
      await show({
        phase: pc.receiveDate ? 'ringing' : 'waiting',
        callId: session.id,
      });
    }
  };

  // The caller got g_b: the key, then g_a with the fingerprint.
  const onAccepted = async (api, pc) => {
    const { session } = held;
    if (!session.out || session.key) {
      return;
    }
    if (!publicInRange(pc.gB, session.config.p)) {
      await abort(api, 'failed', 'dh');
      return;
    }
    session.key = sharedKey(session.config, pc.gB, session.a);
    session.fingerprint = fingerprintOf(session.key);
    await show({ phase: 'connecting' });
    const answer = await api.confirm({
      ...peerOf(),
      ga: session.ga,
      fingerprint: session.fingerprint,
    });
    await step(api, phoneCallOf(answer));
  };

  // The callee got g_a: it must be the one the hash promised.
  const keyOfCallee = (pc) => {
    const { session } = held;
    const ga = Buffer.from(pc.gAOrB ?? []);
    if (!hashOf(ga).equals(session.gaHash)) {
      return 'dh-hash';
    }
    if (!publicInRange(ga, session.config.p)) {
      return 'dh';
    }
    session.ga = ga;
    session.key = sharedKey(session.config, ga, session.b);
    session.fingerprint = fingerprintOf(session.key);
    return null;
  };

  const onEstablished = async (api, pc) => {
    const { session } = held;
    if (session.view.phase === 'active' || !session.config) {
      return;
    }
    const wrong = session.out ? null : keyOfCallee(pc);
    if (wrong || !session.key) {
      await abort(api, 'failed', wrong ?? 'dh');
      return;
    }
    if (text(pc.keyFingerprint) !== session.fingerprint) {
      await abort(api, 'failed', 'fingerprint');
      return;
    }
    await show({
      phase: 'active',
      connected: true,
      startedAt: now(),
      emoji: emojiOf(session.key, session.ga),
      webrtc: (pc.connections ?? []).filter(
        (c) => c?.className === 'PhoneConnectionWebrtc'
      ).length,
    });
  };

  const onDiscarded = (pc) =>
    finish(REASON_OF[pc.reason?.className] ?? 'hangup', {
      duration: pc.duration === undefined ? undefined : Number(pc.duration),
      needRating: pc.needRating === true,
    });

  const step = async (api, pc) => {
    if (!pc) {
      return;
    }
    if (pc.className === 'PhoneCallRequested') {
      await onRequested(api, pc);
      return;
    }
    const { session } = held;
    const mine =
      session &&
      !ended(session) &&
      (session.id
        ? session.id === text(pc.id)
        : pc.className === 'PhoneCallWaiting');
    if (!mine) {
      return;
    }
    const handlers = {
      PhoneCallWaiting: () => onWaiting(pc),
      PhoneCallAccepted: () => onAccepted(api, pc),
      PhoneCall: () => onEstablished(api, pc),
      PhoneCallDiscarded: () => onDiscarded(pc),
      PhoneCallEmpty: () => finish('failed', { code: 'gone' }),
    };
    await handlers[pc.className]?.();
  };

  return { step, configOf };
};

// What the page asks: start, accept, discard, rate.
const createCommands = (holder, steps, { now, exponent, codeOf }) => {
  const { held, show, peerOf, finish, abort, newView } = holder;
  const { step, configOf } = steps;

  const start = async (api, { user, name = '', video = false }) => {
    if (!ended(held.session)) {
      return { ok: false, code: 'busy' };
    }
    held.session = {
      id: null,
      accessHash: null,
      out: true,
      view: newView({ user: text(user), name, video: video === true }),
    };
    await show({});
    const { session } = held;
    try {
      const config = await configOf(api);
      if (!config) {
        await finish('failed', { code: 'dh-config' });
        return { ok: false, code: 'dh-config' };
      }
      const ringMs = ringMsOf(await api.callConfig?.().catch(() => null));
      session.config = config;
      session.a = exponent(config.random);
      session.ga = publicOf(config, session.a);
      await show({ ringMs });
      const answer = await api.request({
        user: text(user),
        gaHash: hashOf(session.ga),
        video: video === true,
      });
      await step(api, phoneCallOf(answer));
      return { ok: true, callId: session.id };
    } catch (error) {
      if (!ended(session)) {
        await finish('failed', { code: codeOf(error) });
      }
      throw error;
    }
  };

  const accept = async (api, { id }) => {
    const { session } = held;
    if (ended(session) || session.out || session.id !== text(id)) {
      return { ok: false, code: 'no-call' };
    }
    if (session.view.phase !== 'incoming') {
      return { ok: true, callId: session.id };
    }
    const config = await configOf(api);
    if (!config) {
      await abort(api, 'failed', 'dh-config');
      return { ok: false, code: 'dh-config' };
    }
    session.config = config;
    session.b = exponent(config.random);
    await show({ phase: 'connecting' });
    const answer = await api.accept({
      ...peerOf(),
      gb: publicOf(config, session.b),
    });
    await step(api, phoneCallOf(answer));
    return { ok: true, callId: session.id };
  };

  const discard = async (api, { id, reason = 'hangup' }) => {
    const { session } = held;
    if (ended(session) || (id && session.id !== text(id))) {
      return { ok: false, code: 'no-call' };
    }
    const why = DISCARD_REASONS.includes(reason) ? reason : 'hangup';
    const { startedAt } = session.view;
    const duration = startedAt
      ? Math.max(0, Math.round((now() - startedAt) / 1000))
      : 0;
    const answer = await api.discard({ ...peerOf(), duration, reason: why });
    await step(api, phoneCallOf(answer));
    if (!ended(session)) {
      await finish(why, { duration });
    }
    return { ok: true, duration };
  };

  const rate = async (api, { id, rating, comment = '' }) => {
    const { session } = held;
    if (!session || session.id !== text(id) || !ended(session)) {
      return { ok: false, code: 'no-call' };
    }
    await api.rate({ ...peerOf(), rating, comment });
    await show({ needRating: false });
    return { ok: true };
  };

  return { start, accept, discard, rate };
};

export const createCallMachine = ({
  now = Date.now,
  publish = async () => {},
  exponent = exponentOf,
  codeOf = () => 'failed',
} = {}) => {
  const holder = createHolder({ now, publish });
  const steps = createSteps(holder, { now });
  const commands = createCommands(holder, steps, { now, exponent, codeOf });
  let tail = Promise.resolve();

  // One command or update at a time; a failure of one never blocks next.
  const enqueue = (task) => {
    const run = tail.then(task, task);
    tail = run.catch(() => {});
    return run;
  };

  return {
    start: (api, input) => enqueue(() => commands.start(api, input)),
    accept: (api, input) => enqueue(() => commands.accept(api, input)),
    discard: (api, input) => enqueue(() => commands.discard(api, input)),
    rate: (api, input) => enqueue(() => commands.rate(api, input)),
    onUpdate: (api, pc) => enqueue(() => steps.step(api, pc)),
    view: () => holder.held.session?.view ?? null,
  };
};
