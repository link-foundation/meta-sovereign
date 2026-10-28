// Pictures and files come from the app's own server (`/api/...`). A page
// on another origin (the hosted app on GitHub Pages, a mobile WebView)
// loads them as CORS requests: the browser then says which page asks
// (`Origin`, which no other site can fake) and the server lets the app's
// own origins have them (../server/routes-telegram.js `fromApp`). A plain
// <img> load from another origin says only "cross-site" and is refused.

import { createRecoveringRequest } from './request-recovery.js';

const requests = createRecoveringRequest({
  fetchImpl: (url, init) => globalThis.fetch(url, init),
});

/** Complete asset bytes, retried through transport and interrupted bodies. */
export const readMedia = async (url, body = 'blob') => {
  const response = await requests.request(
    url,
    { credentials: 'same-origin' },
    { retry: true, body }
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response[body]();
};

/** `'anonymous'` for a server URL on another origin, else undefined. */
export const crossOriginFor = (src, here = globalThis.location?.href) => {
  if (!src || !here) {
    return undefined;
  }
  try {
    const url = new URL(String(src), here);
    return /^https?:$/.test(url.protocol) &&
      url.origin !== new URL(here).origin &&
      url.pathname.startsWith('/api/')
      ? 'anonymous'
      : undefined;
  } catch {
    return undefined;
  }
};

/** `{ src, crossOrigin }` props for an <img>, <video> or <audio>. */
export const mediaSrc = (src) => ({ src, crossOrigin: crossOriginFor(src) });

/**
 * Save the file at `url` as `filename`. Fetched first: a link to another
 * origin (the hosted app's server) opens the file instead of saving it,
 * and its load says no Origin, so the server would refuse it.
 */
export const saveUrl = async (url, filename = '') => {
  const document = globalThis.document;
  if (!url || !document) {
    return;
  }
  let href = url;
  if (crossOriginFor(url)) {
    try {
      href = globalThis.URL.createObjectURL(await readMedia(url));
    } catch {
      // The link as it is: the browser says what went wrong.
    }
  }
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  if (href !== url) {
    globalThis.setTimeout(() => globalThis.URL.revokeObjectURL(href), 60_000);
  }
};
