import { setTimeout as delay } from 'node:timers/promises';
import {
  unreadInput,
  unreadPass,
  unreadReviewFixture,
} from './question-unread-review-fixture.mjs';
import { UnreadPollingCycle } from '../../js/src/automation/question-unread-polling-cycle.js';

/** Bounded observation only; waiting never starts a pass. */
export const waitUnreadPolling = async (browser, id, accept) => {
  for (let attempt = 0; attempt < 600; attempt++) {
    const result = await browser.unreadStatus({ id });
    if (accept(result)) {
      return result;
    }
    await delay(5);
  }
  throw new Error('Unread polling did not reach the expected state');
};

export const pollingSettings = {
  intervalMs: 1000,
  durationMs: 60000,
  retryMaxMs: 2000,
  maxFailures: 3,
};

export const withPollingFixture = async (
  work,
  { scan, settings = pollingSettings, fixture = unreadReviewFixture } = {}
) => {
  const env = await fixture(scan);
  const input = { ...(env.input ?? unreadInput()), polling: settings };
  try {
    return await work(env, input);
  } finally {
    await env.browser.close();
  }
};

export const gatedPollingFixture = async (work, settings = pollingSettings) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  return withPollingFixture(
    async (env, input) => {
      try {
        return await work(env, input, release);
      } finally {
        release();
      }
    },
    {
      settings,
      scan: async () => {
        await gate;
        return unreadPass();
      },
    }
  );
};

export const pollingCycleFixture = ({
  finite,
  settings = pollingSettings,
  clock = () => new Date(0),
  pause,
} = {}) => {
  const runtime = {
    controller: new AbortController(),
    input: {},
    record: {
      state: 'active',
      polling: {
        settings,
        expiresAt: new Date(60000).toISOString(),
        passes: 0,
        failures: 0,
      },
    },
  };
  const cycle = new UnreadPollingCycle({
    runtime,
    finite,
    clock,
    pause,
    save: async (patch) => {
      Object.assign(runtime.record, patch);
    },
  });
  return { cycle, runtime };
};
