import { setTimeout as sleep } from 'node:timers/promises';
import { requestServerControl } from '../../src/server/rolling-control.js';

/** Read-only probes share a finite startup budget, including socket waits. */
export const statusWhenReady = async (
  dir,
  {
    request = requestServerControl,
    now = () => globalThis.performance.now(),
    pause = sleep,
    budgetMs = 10000,
  } = {}
) => {
  const deadline = now() + budgetMs;
  let last;
  while (now() < deadline) {
    try {
      return await request(
        dir,
        { operation: 'status' },
        { timeoutMs: Math.max(1, Math.min(1000, deadline - now())) }
      );
    } catch (error) {
      if (!['ENOENT', 'ECONNREFUSED', 'HOST_TIMEOUT'].includes(error.code)) {
        throw error;
      }
      last = error;
    }
    const remaining = deadline - now();
    if (remaining > 0) {
      await pause(Math.min(50, remaining));
    }
  }
  throw new Error('CLI host did not start', { cause: last });
};
