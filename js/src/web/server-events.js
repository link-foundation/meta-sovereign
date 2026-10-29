// EventSource retries ordinary disconnects itself, but a CLOSED source needs
// to be replaced. Keep doing that while its owning view remains mounted.
import { READ_RECOVERED_EVENT } from './read-retry.js';

export const openServerEvents = (
  url,
  handlers,
  {
    Source = globalThis.EventSource,
    clock = globalThis,
    target = globalThis,
    signal,
    delays = [1000, 2000, 5000, 10000, 30000],
    watchdogMs = 0,
  } = {}
) => {
  if (signal?.aborted) {
    return () => {};
  }
  let source = null;
  let stopped = false;
  let timer = null;
  let attempts = 0;
  let stalled = false;
  let watchdog = null;
  const watch = (ms = watchdogMs) => {
    clock.clearTimeout(watchdog);
    if (ms > 0 && !stopped) {
      watchdog = clock.setTimeout(() => {
        watchdog = null;
        if (!stopped) {
          open();
        }
      }, ms);
    }
  };
  const open = () => {
    if (stopped) {
      return;
    }
    clock.clearTimeout(timer);
    timer = null;
    source?.close();
    source = new Source(url);
    stalled = false;
    watch();
    const current = source;
    for (const [name, handler] of Object.entries(handlers)) {
      current.addEventListener(name, (event) => {
        if (!stopped && current === source) {
          handler(event);
        }
      });
    }
    const healthy = () => {
      if (stopped || current !== source) {
        return;
      }
      attempts = 0;
      stalled = false;
      watch();
    };
    current.addEventListener('ready', healthy);
    current.addEventListener('message', healthy);
    current.addEventListener('link', healthy);
    current.addEventListener('heartbeat', healthy);
    current.addEventListener('error', () => {
      if (
        !stopped &&
        current === source &&
        current.readyState === 0 &&
        watchdogMs &&
        !stalled
      ) {
        // Give native reconnect a chance, then replace a CONNECTING source
        // which Safari otherwise can leave stalled indefinitely.
        stalled = true;
        watch(Math.min(watchdogMs, 10000));
      }
      if (
        stopped ||
        current !== source ||
        current.readyState !== 2 ||
        timer !== null
      ) {
        return;
      }
      clock.clearTimeout(watchdog);
      timer = clock.setTimeout(
        open,
        delays[Math.min(attempts++, delays.length - 1)]
      );
    });
  };
  const wake = () => {
    if (timer !== null) {
      open();
    }
  };
  const stop = () => {
    stopped = true;
    clock.clearTimeout(timer);
    clock.clearTimeout(watchdog);
    source?.close();
    target.removeEventListener?.(READ_RECOVERED_EVENT, wake);
    target.removeEventListener?.('online', wake);
    signal?.removeEventListener('abort', stop);
  };
  target.addEventListener?.(READ_RECOVERED_EVENT, wake);
  target.addEventListener?.('online', wake);
  signal?.addEventListener('abort', stop, { once: true });
  open();
  return stop;
};
