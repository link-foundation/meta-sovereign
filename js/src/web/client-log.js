// The page's own errors, sent to the local server's log file
// (POST /api/client-log), so one log holds what both sides did: a script
// error, a promise nobody caught. Only the error and where in our code it
// happened are sent, never what the user reads; the same error is sent
// once, and at most twenty a minute.

const PER_MINUTE = 20;

/** The entry for an error event or a rejection's reason. */
export const errorEntry = (event, cause, view) => ({
  level: 'error',
  event,
  error: String(cause?.message ?? cause ?? 'unknown').slice(0, 300),
  stack: typeof cause?.stack === 'string' ? cause.stack.slice(0, 4000) : null,
  view: view ?? null,
});

/** Report `window` errors through `send`; returns an uninstaller. */
export const installClientLog = ({
  target = globalThis.window,
  send,
  view = () => globalThis.location?.hash?.slice(1, 40) || null,
  now = Date.now,
} = {}) => {
  if (!target?.addEventListener || typeof send !== 'function') {
    return () => {};
  }
  const seen = new Set();
  let windowStart = 0;
  let used = 0;
  const report = (entry) => {
    const key = `${entry.event}:${entry.error}`;
    if (seen.has(key)) {
      return;
    }
    if (now() - windowStart >= 60_000) {
      windowStart = now();
      used = 0;
    }
    used += 1;
    if (used > PER_MINUTE) {
      return;
    }
    seen.add(key);
    Promise.resolve()
      .then(() => send(entry))
      .catch(() => {});
  };
  const onError = (event) =>
    report(errorEntry('error', event?.error ?? event?.message, view()));
  const onRejection = (event) =>
    report(errorEntry('unhandled_rejection', event?.reason, view()));
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
};
