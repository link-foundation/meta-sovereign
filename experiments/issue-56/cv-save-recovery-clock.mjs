import { setTimeout as delay } from 'node:timers/promises';
import {
  cvWatchAttempt,
  cvWatchHash,
  cvWatchRaw,
} from './cv-watch-fixture.mjs';

/** One finite navigation failure; logical poll time is independent of host load. */
export const cvSaveRecoveryClock = () => {
  const state = { probes: 0, reads: 0, elapsed: 0, waits: 0 };
  const requested = Number(process.env.CV_WATCH_FIXTURE_DESCHEDULE_MS ?? 0);
  if (!Number.isInteger(requested) || requested < 0 || requested > 1000) {
    throw new Error(
      'Use a finite CV fixture descheduling delay up to 1000 ms.'
    );
  }
  return {
    state,
    options: {
      session: {
        page: { url: () => cvWatchAttempt().url },
        commander: {
          evaluate: async () => {
            if (++state.probes === 1) {
              if (requested) {
                await delay(requested);
              }
              throw new Error(
                'Execution context was destroyed during navigation'
              );
            }
            return null;
          },
        },
      },
      attempt: { ...cvWatchAttempt(), kind: 'about' },
      check: () => {},
      signal: new AbortController().signal,
      readExports: async () => {
        state.reads++;
        return [
          { hash: cvWatchHash, cv: cvWatchRaw(), sha256: 'a'.repeat(64) },
        ];
      },
      pollMs: 1,
      verificationMs: 100,
      clock: {
        now: () => state.elapsed,
        wait: async (ms, _value, { signal }) => {
          signal.throwIfAborted();
          state.elapsed += ms;
          state.waits++;
        },
      },
    },
  };
};
