/**
 * Pull new mail now and then, when a mailbox is connected (R-Z5).
 *
 * Nothing runs until the user has saved a connection (a token, or host +
 * login + password). Every `intervalMs` (ten minutes by default) one
 * pull runs, one at a time; a pull that fails (a rate limit, a bad
 * password, no network) backs the wait off to twice as long, up to an
 * hour, and the next success restores it. The pull itself is
 * incremental (./../sources/email-store.js), so a quiet mailbox costs one
 * short request. Timers are unref'd and `stop()` ends them.
 */

import { emailConfigured } from '../sources/email-store.js';
import { liveOptionsFrom, pullLiveInto } from '../sources/index.js';

const MIN_MS = 60_000;
const MAX_MS = 60 * 60_000;

export const createEmailPoller = ({
  store,
  intervalMs = 10 * 60_000,
  firstMs = 30_000,
  pull = (s) => pullLiveInto(s, 'email', { limit: 20 }),
  log = null,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) => {
  const base = Math.max(MIN_MS, intervalMs);
  let timer = null;
  let stopped = false;
  let wait = base;

  const schedule = (ms) => {
    if (stopped) {
      return;
    }
    timer = setTimer(run, ms);
    timer?.unref?.();
  };

  async function run() {
    timer = null;
    try {
      const options = await liveOptionsFrom(store, 'email');
      if (emailConfigured(options)) {
        const result = await pull(store);
        wait = base;
        log?.({
          level: 'info',
          event: 'email_polled',
          imported: result?.imported ?? 0,
        });
      }
    } catch (error) {
      wait = Math.min(MAX_MS, wait * 2);
      log?.({
        level: 'warn',
        event: 'email_poll_failed',
        code: error.code ?? null,
        waitMs: wait,
      });
    }
    schedule(wait);
  }

  return {
    start: () => schedule(Math.max(0, firstMs)),
    stop: () => {
      stopped = true;
      if (timer) {
        clearTimer(timer);
      }
    },
    runNow: run,
  };
};
