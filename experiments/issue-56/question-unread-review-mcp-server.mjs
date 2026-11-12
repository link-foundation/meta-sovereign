import { runUnreadInspectionFixture } from './unread-inspection-server.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import {
  unreadReviewFixture,
  unreadPass,
} from './question-unread-review-fixture.mjs';

// Independent public UI/service verification. Native traversal has a separate
// real-Chromium fixture; this counted boundary can hold cancellation precisely.
let mode = 'normal';
let pending = 0;
const env = await unreadReviewFixture(async ({ signal }) => {
  pending++;
  try {
    if (mode === 'owner') {
      throw Object.assign(new Error('The owner returned.'), {
        code: 'browser-background-owner-active',
        restoration: { restored: false, reason: 'owner-active' },
      });
    }
    if (mode === 'stop' && !signal.aborted) {
      try {
        await delay(5000, undefined, { signal });
      } catch (error) {
        if (error.name !== 'AbortError') {
          throw error;
        }
      }
    }
    const pass = unreadPass();
    if (signal.aborted) {
      pass.conversations = [];
      pass.coverage = { ...pass.coverage, visited: 0, reason: 'cancelled' };
    }
    return pass;
  } finally {
    pending--;
  }
});
await runUnreadInspectionFixture(env, {
  pending: () => pending,
  handle(url) {
    if (url.pathname === '/mode') {
      const next = url.searchParams.get('value');
      if (!['normal', 'owner', 'stop'].includes(next)) {
        return false;
      }
      mode = next;
    }
    return true;
  },
});
