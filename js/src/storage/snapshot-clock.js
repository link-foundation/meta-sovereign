/** Shared real clock; finite tests can advance snapshot schedules explicitly. */
export const SNAPSHOT_CLOCK = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (timer) => globalThis.clearTimeout(timer),
};
