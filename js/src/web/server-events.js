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
  } = {}
) => {
  if (signal?.aborted) {
    return () => {};
  }
  let source = null;
  let stopped = false;
  let timer = null;
  let attempts = 0;
  const open = () => {
    if (stopped) {
      return;
    }
    clock.clearTimeout(timer);
    timer = null;
    source?.close();
    source = new Source(url);
    const current = source;
    for (const [name, handler] of Object.entries(handlers)) {
      current.addEventListener(name, (event) => {
        if (!stopped && current === source) {
          handler(event);
        }
      });
    }
    const healthy = () => {
      attempts = 0;
    };
    current.addEventListener('ready', healthy);
    current.addEventListener('message', healthy);
    current.addEventListener('error', () => {
      if (
        stopped ||
        current !== source ||
        current.readyState !== 2 ||
        timer !== null
      ) {
        return;
      }
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
