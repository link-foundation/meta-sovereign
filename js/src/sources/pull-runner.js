/**
 * One small runner for "fetch now" and "fetch on a schedule" of a network's
 * inbox (R-Z8; the page's Fetch button and the background poller share it).
 *
 * A job is `{ ready(), run(), intervalMs }`:
 *  - `ready()` is true when the network is connected (a saved token), so a
 *    network nobody connected is never polled;
 *  - `run()` pulls and stores, returning `{ imported, ... }`. It saves any
 *    cursor itself, and only AFTER the store write succeeded, so a failed
 *    write is read again next time instead of skipped.
 *
 * `fetchNow(source)` is the button: at most one run per `minGapMs` (15 s) for
 * a network, background runs counted too, and one at a time. `start()` is
 * the schedule: each ready job runs every `intervalMs`, and after a failure
 * the wait doubles up to `maxBackoffMs`, so a dead token or a down network
 * is not hammered. Nothing starts before `start()`, which the server calls
 * only once it listens. Errors come back as `{ ok: false, error, code }`
 * with secrets masked; nothing here throws at a caller.
 *
 * A job may also have `due()` (checked by the schedule only, so a network
 * whose user turned the schedule off can still be fetched by hand) and its
 * `intervalMs` is then just how often `due()` is asked.
 *
 * A pull that VK stops with a captcha (code `captcha`) is marked
 * `needsAttention` in `lastError`: neither the schedule nor this runner
 * shows or solves it (R-Z20; the page asks only for the user's own actions).
 *
 * `pull-state:<source>` keeps `lastOkAt` and a job's own cursor.
 */

import { safeMessage } from '../server/redact.js';

export const PULL_MIN_GAP_MS = 15_000;
const MAX_BACKOFF_MS = 60 * 60_000;

const stateId = (source) => `pull-state:${source}`;
// Writes of one source's state are queued, so two patches never overwrite
// each other (a manual fetch and the poller can overlap).
const queues = new WeakMap();

export const loadPullState = async (store, source) =>
  (await store.get(stateId(source))) ?? {};

/** Merge `patch` into the source's state link; the write has finished on return. */
export const savePullState = (store, source, patch) => {
  const byStore = queues.get(store) ?? new Map();
  queues.set(store, byStore);
  const run = async () => {
    const current = await loadPullState(store, source);
    const next = {
      ...current,
      ...patch,
      id: stateId(source),
      tokens: ['pull', 'state', source],
      children: [],
    };
    await store.put(next);
    return next;
  };
  const queued = (byStore.get(source) ?? Promise.resolve()).then(run, run);
  byStore.set(
    source,
    queued.catch(() => {})
  );
  return queued;
};

const failure = (error, extra = {}) => ({
  ok: false,
  error: safeMessage(error),
  code: error?.code && typeof error.code === 'string' ? error.code : 'failed',
  ...(error?.retryAfter > 0 ? { retryAfterMs: error.retryAfter * 1000 } : {}),
  ...extra,
});

export const createPullRunner = ({
  store,
  jobs,
  now = Date.now,
  minGapMs = PULL_MIN_GAP_MS,
  maxBackoffMs = MAX_BACKOFF_MS,
  log = null,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) => {
  const lastStart = new Map();
  const running = new Set();
  const timers = new Map();
  let stopped = true;

  const execute = async (source) => {
    const job = jobs[source];
    running.add(source);
    lastStart.set(source, now());
    try {
      const result = (await job.run()) ?? {};
      const lastOkAt = new Date(now()).toISOString();
      await savePullState(store, source, { lastOkAt, lastError: null });
      return { ok: true, source, lastOkAt, imported: result.imported ?? 0 };
    } catch (error) {
      const out = failure(error, { source });
      log?.({ level: 'warn', event: 'pull_failed', source, code: out.code });
      await savePullState(store, source, {
        lastError: {
          code: out.code,
          at: new Date(now()).toISOString(),
          // A captcha only the user can solve, in the app: the schedule
          // backs off and never asks (R-Z20).
          ...(out.code === 'captcha' ? { needsAttention: true } : {}),
        },
      }).catch(() => {});
      return out;
    } finally {
      running.delete(source);
    }
  };

  const fetchNow = async (source) => {
    const job = jobs[source];
    if (!job) {
      return failure(new Error(`no inbox pull for "${source}"`), {
        code: 'unsupported',
      });
    }
    if (!(await job.ready())) {
      return failure(new Error(`${source} is not connected: save its token`), {
        code: 'not-connected',
      });
    }
    const since = now() - (lastStart.get(source) ?? -Infinity);
    if (running.has(source) || since < minGapMs) {
      return failure(new Error('fetched a moment ago; wait a few seconds'), {
        code: 'rate-limited',
        retryAfterMs: running.has(source) ? minGapMs : minGapMs - since,
      });
    }
    return execute(source);
  };

  // One scheduled run; the number of failures in a row after it.
  const tick = async (source, fails) => {
    try {
      const job = jobs[source];
      if (!(await job.ready()) || running.has(source)) {
        return fails;
      }
      if (job.due && !(await job.due())) {
        return fails;
      }
      return (await execute(source)).ok ? 0 : fails + 1;
    } catch {
      return fails + 1;
    }
  };

  const schedule = (source, delay, fails) => {
    if (stopped) {
      return;
    }
    const timer = setTimer(async () => {
      const next = await tick(source, fails);
      const wait = jobs[source].intervalMs * 2 ** Math.min(next, 10);
      schedule(source, Math.min(wait, maxBackoffMs), next);
    }, delay);
    timer?.unref?.();
    timers.set(source, timer);
  };

  return {
    fetchNow,
    /** Start the schedules (call after the server listens). */
    start() {
      // A second start must not run a second schedule (R-Z20).
      if (!stopped) {
        return;
      }
      stopped = false;
      for (const [source, job] of Object.entries(jobs)) {
        if (job.intervalMs > 0) {
          schedule(source, job.firstDelayMs ?? job.intervalMs, 0);
        }
      }
    },
    stop() {
      stopped = true;
      for (const timer of timers.values()) {
        clearTimer(timer);
      }
      timers.clear();
    },
    sources: () => Object.keys(jobs),
    connected: (source) => jobs[source].ready(),
  };
};
