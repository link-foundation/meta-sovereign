// Follow a discovered server without coupling the policy to the DOM API.
import { createBuildWatch, createRediscovery } from './client.js';
import { discoverServer } from './discover.js';
import { debugBrowser } from './client-log.js';

// Every copy, including GitHub Pages, retries a failed initial discovery.
// The optional local copy also follows new server builds (R-Y65).
export const followServer = (client, origin) => {
  const here = globalThis.location?.origin ?? '';
  const reload = (reason) => {
    debugBrowser('reload', { reason, origin, here });
    globalThis.location?.reload?.();
  };
  debugBrowser('follow-server', { origin, here });
  // DOM API helpers are also used by scripts and tests without a page.
  if (!here) {
    return null;
  }
  if (!origin) {
    return createRediscovery({
      discover: () => discoverServer({}),
      found: () => reload('rediscovery'),
    });
  }
  if (origin !== here || typeof globalThis.fetch !== 'function') {
    return null;
  }
  const watch = createBuildWatch({
    bundleUrl: new URL('./app.min.js', globalThis.location.href).toString(),
    fetchImpl: globalThis.fetch.bind(globalThis),
    reload: () => reload('build-changed'),
  });
  client.on((event) => {
    if (event.type === 'mode-change' && event.online) {
      watch.check();
    }
  });
  return watch;
};
