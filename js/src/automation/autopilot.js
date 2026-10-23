/**
 * Autopilot (R-Y87): an automation goes through every chat it fits by
 * itself — the user's edited text included (R-Y86) — one chat at a time,
 * as a person would: typing, send, a pause of the automation's pacing,
 * the next one, and no more than its daily cap.
 *
 * Its state is the `automation-autopilot:<automation>` link, streamed to
 * the app: which chat it is on (`current`), what it did (`sent`,
 * `failed`), how many are left and when it goes on (`nextAt`). With
 * `monitor` on, the app opens each chat as the autopilot comes to it, so
 * the user watches it work; turning the monitor off leaves it working.
 *
 * A chat that cannot be written to is passed over; one the network
 * cannot reach now (no connection, signed out) pauses the autopilot with
 * the reason. It stays on across a restart of the server until the user
 * stops it or no chat is left.
 */

import { setTimeout as delay } from 'node:timers/promises';
import { DAY_MS } from '../crm/reengage.js';
import { AUTOPILOT_PREFIX, RUN_PREFIX, automationKey } from './automations.js';
import { MAX_CONSECUTIVE_FAILURES, recentSends } from './outbox.js';
import { loadSettings, quietMsLeft } from './safety.js';

export const autopilotId = (automation) =>
  `${AUTOPILOT_PREFIX}${automationKey(automation)}`;

// Failures that are about one chat: pass it over and go on.
const CHAT_FAILURES = new Set([
  'unknown-chat',
  'write-forbidden',
  'too-long',
  'bad-draft',
  'opted-out',
  'already-sent',
  'send-in-doubt',
]);

/** What to do after a failed send: next chat, wait, or pause. */
export const afterFailure = (outcome) => {
  if (outcome.code === 'flood-wait') {
    return { wait: Math.max(Number(outcome.retryAfter ?? 60), 1) * 1000 };
  }
  return CHAT_FAILURES.has(outcome.code) ? { next: true } : { pause: true };
};

// When the oldest send of the last day leaves the window (the ledger and
// the outbox, `sending` and `unknown` sends included: R-Z3).
const capEndsAt = (links, automation, now) => {
  const times = recentSends(
    links,
    automation.id,
    now,
    `${RUN_PREFIX}${automationKey(automation)}:`
  ).map((s) => s.ms);
  return { count: times.length, endsAt: Math.min(...times) + DAY_MS };
};

const pauseMs = (pacing, random) => {
  const span = Math.max(pacing.maxDelayMs - pacing.minDelayMs, 0);
  return pacing.minDelayMs + Math.round(random() * span);
};

// What a failed send means: the error a pause reports, and what next.
const failureStep = (outcome, streak) => {
  if (streak >= MAX_CONSECUTIVE_FAILURES) {
    return { pause: 'too-many-failures' };
  }
  const then = afterFailure(outcome);
  if (!then.pause) {
    return then;
  }
  const doubt = outcome.status === 'unknown' ? 'unknown-send' : null;
  return { pause: outcome.code ?? doubt ?? outcome.error ?? 'send-failed' };
};

// The autopilot's work, step by step: its state link, the cap, one chat.
const pilotSteps = ({ store, runner, clock, sleep, random, log }) => {
  const save = async (automation, fields) => {
    const id = autopilotId(automation);
    const before = (await store.get(id)) ?? {};
    const next = {
      ...before,
      id,
      tokens: ['automation-autopilot', automationKey(automation)],
      automation: automation.id,
      automationName: automation.name,
      ...fields,
      updatedAt: clock().toISOString(),
    };
    await store.put(next);
    return next;
  };

  // Rests for `ms` (false once stopped).
  const rest = async (ms, signal) => {
    try {
      await sleep(Math.max(ms, 0), signal);
      return !signal.aborted;
    } catch {
      return false;
    }
  };

  const capped = async (automation, signal) => {
    const cap = Number(automation.pacing.dailyCap ?? Infinity);
    const links = await store.query(
      (l) =>
        l?.id?.startsWith(`${RUN_PREFIX}${automationKey(automation)}:`) ||
        l?.id?.startsWith('outbox:')
    );
    const { count, endsAt } = capEndsAt(links, automation, clock().getTime());
    if (count < cap) {
      return false;
    }
    await save(automation, {
      status: 'capped',
      current: null,
      nextAt: new Date(endsAt).toISOString(),
    });
    await rest(endsAt - clock().getTime(), signal);
    return true;
  };

  // Night hours (the user's timezone): the autopilot rests until they end.
  const quiet = async (automation, signal) => {
    const settings = await loadSettings(store);
    const left = quietMsLeft(clock().getTime(), settings);
    if (left <= 0) {
      return false;
    }
    await save(automation, {
      status: 'quiet',
      current: null,
      nextAt: new Date(clock().getTime() + left).toISOString(),
    });
    await rest(left, signal);
    return true;
  };

  // One chat: its draft, typing, send. What happened, and what next.
  const step = async (automation, passed, signal) => {
    const { draft } = await runner.next(automation.id, { exclude: passed });
    if (!draft) {
      return { done: true };
    }
    await save(automation, {
      status: 'sending',
      current: { source: draft.source, chat: draft.chat, name: draft.name },
      nextAt: null,
    });
    if (signal.aborted) {
      return { stopped: true };
    }
    const outcome = await runner.deliverDraft(automation.id, draft);
    return { draft, outcome };
  };

  const loop = async (automation, signal) => {
    const passed = [];
    const counts = {
      sent: 0,
      failed: 0,
      ...((await store.get(autopilotId(automation))) ?? {}),
    };
    let streak = 0;
    while (!signal.aborted) {
      if (
        (await quiet(automation, signal)) ||
        (await capped(automation, signal))
      ) {
        continue;
      }
      const result = await step(automation, passed, signal);
      if (result.done) {
        await save(automation, { on: false, status: 'done', current: null });
        return;
      }
      if (result.stopped) {
        return;
      }
      const { draft, outcome } = result;
      let wait = pauseMs(automation.pacing, random);
      const ok = outcome.status === 'sent';
      streak = ok ? 0 : streak + 1;
      counts[ok ? 'sent' : 'failed'] += 1;
      if (!ok) {
        log({
          level: 'warn',
          event: 'autopilot_send_failed',
          automation: automation.id,
          code: outcome.code ?? null,
        });
        const then = failureStep(outcome, streak);
        if (then.pause) {
          await save(automation, {
            on: false,
            status: 'paused',
            sent: counts.sent,
            failed: counts.failed,
            error: then.pause,
          });
          return;
        }
        if (then.next) {
          passed.push({ source: draft.source, chat: draft.chat });
        } else {
          wait = then.wait;
        }
      }
      await save(automation, {
        status: 'waiting',
        sent: counts.sent,
        failed: counts.failed,
        last: {
          source: draft.source,
          chat: draft.chat,
          status: outcome.status,
        },
        nextAt: new Date(clock().getTime() + wait).toISOString(),
      });
      await rest(wait, signal);
    }
  };

  return { save, loop };
};

/**
 * `runner` is ./runner.js's (load, next, deliverDraft); `store` holds
 * the state links.
 */
export const createAutopilot = ({
  store,
  runner,
  clock = () => new Date(),
  sleep = (ms, signal) => delay(ms, undefined, { signal }),
  random = Math.random,
  log = () => {},
} = {}) => {
  const running = new Map(); // automation id -> AbortController
  const { save, loop } = pilotSteps({
    store,
    runner,
    clock,
    sleep,
    random,
    log,
  });

  const run = (automation) => {
    const controller = new AbortController();
    running.set(automation.id, controller);
    loop(automation, controller.signal)
      .catch(async (error) => {
        log({
          level: 'error',
          event: 'autopilot_failed',
          error: error.message,
        });
        await save(automation, {
          on: false,
          status: 'paused',
          error: error.message,
        }).catch(() => {});
      })
      .finally(() => {
        if (running.get(automation.id) === controller) {
          running.delete(automation.id);
        }
      });
  };

  return {
    /** Turn it on (confirmed by the user) and go. */
    async start(
      automationOrId,
      { monitor = true, resumeOnStart = false } = {}
    ) {
      const automation = await runner.load(automationOrId);
      running.get(automation.id)?.abort();
      const state = await save(automation, {
        on: true,
        monitor,
        resumeOnStart: resumeOnStart === true,
        status: 'starting',
        startedAt: clock().toISOString(),
        sent: 0,
        failed: 0,
        error: null,
        current: null,
        last: null,
      });
      run(automation);
      return state;
    },
    async stop(automationOrId) {
      const automation = await runner.load(automationOrId);
      running.get(automation.id)?.abort();
      running.delete(automation.id);
      return save(automation, {
        on: false,
        status: 'stopped',
        current: null,
        nextAt: null,
      });
    },
    /** Watching it or not changes nothing in what it does. */
    async monitor(automationOrId, monitor) {
      const automation = await runner.load(automationOrId);
      return save(automation, { monitor: Boolean(monitor) });
    },
    async states() {
      return store.query((l) => l?.id?.startsWith(AUTOPILOT_PREFIX));
    },
    /**
     * After a restart (R-Z3): an autopilot stays paused until the user
     * resumes it, unless it was explicitly set to resume on start. The
     * user's confirmation was for a past session.
     */
    async resume() {
      for (const state of await this.states()) {
        if (!state.on || running.has(state.automation)) {
          continue;
        }
        const automation = await runner.load(state.automation);
        if (state.resumeOnStart === true) {
          run(automation);
        } else {
          await save(automation, {
            on: false,
            status: 'paused',
            error: 'paused-after-restart',
            current: null,
            nextAt: null,
          });
        }
      }
    },
    stopAll() {
      for (const controller of running.values()) {
        controller.abort();
      }
      running.clear();
    },
  };
};
