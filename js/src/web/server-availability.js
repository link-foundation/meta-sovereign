import { DISCOVERY_PATH } from './discover.js';

/** Shared availability checks; a busy endpoint is not a disconnected server. */
export const createAvailability = ({
  server,
  setOnline,
  recheckMs = 10_000,
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer = (timer) => globalThis.clearTimeout(timer),
}) => {
  let pending = null;
  let timer = null;
  let failures = 0;
  let revision = 0;
  const stop = () => {
    clearTimer(timer);
    timer = null;
    failures = 0;
    revision += 1;
  };
  const reached = () => {
    stop();
    setOnline(true);
  };
  const failed = () => {
    if (pending) {
      return pending;
    }
    const target = server();
    if (!target?.fetchImpl) {
      return Promise.resolve();
    }
    const started = revision;
    pending = Promise.resolve()
      .then(() =>
        target.fetchImpl(`${target.origin}${DISCOVERY_PATH}`, {
          cache: 'no-store',
          signal: globalThis.AbortSignal?.timeout?.(10_000),
        })
      )
      .then(
        () => true,
        () => false
      )
      .then((back) => {
        if (server() !== target || revision !== started) {
          return;
        }
        if (back) {
          reached();
          return;
        }
        failures += 1;
        if (failures >= 2) {
          setOnline(false);
        }
        if (timer === null) {
          timer = setTimer(() => {
            timer = null;
            return failed();
          }, recheckMs);
          timer?.unref?.();
        }
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
  return { failed, reached, stop };
};
