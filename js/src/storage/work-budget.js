// Cooperative background pacing; timers and time are injectable for tiny tests.
export const createWorkBudget = ({
  workMs = 8,
  restMs = 24,
  now = () => globalThis.performance.now(),
  sleep = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms)),
} = {}) => {
  let started = now();
  return async () => {
    if (now() - started < workMs) {
      return;
    }
    await sleep(restMs);
    started = now();
  };
};
