// Follow a discovered server without coupling the policy to the DOM API.
import { createBuildWatch, createRediscovery } from './client.js';
import { discoverServer } from './discover.js';
import { debugBrowser } from './client-log.js';

// Capture this before asynchronous boot: an old document can finish opening
// its store after navigation. A bfcache page is suspended and may return.
export const createPageLifetime = (events = globalThis) => {
  const lifetime = new AbortController();
  const hide = (event) => {
    if (!event.persisted) {
      lifetime.abort();
      events.removeEventListener?.('pagehide', hide);
    }
  };
  events.addEventListener?.('pagehide', hide);
  return lifetime.signal;
};

// Every copy, including GitHub Pages, retries a failed initial discovery.
// The optional local copy also follows new server builds (R-Y65).
export const followServer = (client, origin, { signal } = {}) => {
  const here = globalThis.location?.origin ?? '';
  let stopped = false;
  const reload = (reason) => {
    if (stopped || signal?.aborted) {
      return;
    }
    debugBrowser('reload', { reason, origin, here });
    globalThis.location?.reload?.();
  };
  debugBrowser('follow-server', { origin, here });
  // DOM API helpers are also used by scripts and tests without a page.
  if (!here || signal?.aborted) {
    return null;
  }
  if (!origin) {
    const retry = createRediscovery({
      discover: () => discoverServer({ signal }),
      found: () => reload('rediscovery'),
    });
    signal?.addEventListener('abort', retry.stop, { once: true });
    return retry;
  }
  if (origin !== here || typeof globalThis.fetch !== 'function') {
    return null;
  }
  const watch = createBuildWatch({
    bundleUrl: new URL('./app.min.js', globalThis.location.href).toString(),
    fetchImpl: globalThis.fetch.bind(globalThis),
    reload: () => reload('build-changed'),
  });
  const unsubscribe = client.on((event) => {
    if (
      !stopped &&
      !signal?.aborted &&
      event.type === 'mode-change' &&
      event.online
    ) {
      watch.check();
    }
  });
  const stop = () => {
    stopped = true;
    unsubscribe();
    signal?.removeEventListener('abort', stop);
  };
  signal?.addEventListener('abort', stop, { once: true });
  return { check: watch.check, stop };
};
