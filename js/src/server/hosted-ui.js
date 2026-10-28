/**
 * Which web page is the app's face (R-Y58, R-Y59).
 *
 * By default it is the hosted one on GitHub Pages: a static bundle that
 * finds this server (./../web/discover.js) and becomes the full app
 * through it, so the server does not have to host a web site. The copy
 * the server serves itself is an opt-in fallback for offline use:
 * `serve --local-ui=true` or `MS_LOCAL_UI=on`. By default `/` sends the
 * browser to the hosted app. Safari uses the local HTTPS API after the
 * server's certificate is trusted; it does not need the local UI.
 *
 * The hosted app finds the server by itself, on our port (8787) and the
 * few others it looks at (DEFAULT_PORTS in ../web/discover.js); no
 * address is put in its link. On any other port `serve` says so.
 *
 * `serve --ui-url=` (or `MS_UI_URL`) names another hosted copy, a
 * fork's Pages for example; its origin is allowed to use the server.
 *
 * Safari refuses the hosted page's requests to http://127.0.0.1 but
 * still shows it images from there, so the server answers one small
 * picture (BEACON_PATH) whose size says "here I am" and whether its own
 * copy is on; the hosted page offers certificate setup and links the
 * optional local copy only when enabled (../web/discover.js).
 * With cross-origin use off (`--allow-origin=none`) there is no picture.
 *
 * With HTTPS on (./local-tls.js, R-Y64) Safari can use the server at
 * https://127.0.0.1 once it trusts the server's certificate; the picture
 * says HTTPS is on, and `/trust` is the page Safari is shown to trust it.
 */

export const HOSTED_UI_URL =
  'https://link-foundation.github.io/meta-sovereign/';

import { BEACON_PATH, BEACON_WIDTH, DEFAULT_PORTS } from '../web/discover.js';

const OFF = new Set(['0', 'false', 'off', 'no', 'none']);

/** The hosted app's address, ending in `/`. */
export const hostedUiUrl = (value = process.env.MS_UI_URL) => {
  try {
    const url = new URL(String(value || HOSTED_UI_URL));
    if (!/^https?:$/.test(url.protocol)) {
      return HOSTED_UI_URL;
    }
    url.search = '';
    url.hash = '';
    return url.href.endsWith('/') ? url.href : `${url.href}/`;
  } catch {
    return HOSTED_UI_URL;
  }
};

/** Whether the server serves its own copy of the app (default no). */
export const localUiEnabled = (value = process.env.MS_LOCAL_UI) =>
  value === undefined || value === null || value === true
    ? value === true
    : !OFF.has(String(value).trim().toLowerCase());

/** Whether the hosted app looks for a server on this port by itself. */
export const foundOnPort = (port) => DEFAULT_PORTS.includes(Number(port));

/** The allow-list with the hosted app's origin on it. */
export const withHostedOrigin = (allowed, uiUrl) => {
  const origin = new URL(hostedUiUrl(uiUrl)).origin;
  return allowed.includes(origin) ? allowed : [...allowed, origin];
};

/**
 * With the local copy off: `/` goes to the hosted app, every other
 * page file is not here. Returns true when the request was answered.
 */
export const redirectToHosted = (req, res, p, uiUrl) => {
  if (req.method !== 'GET' || (p !== '/' && p !== '/index.html')) {
    return false;
  }
  res.writeHead(302, {
    location: hostedUiUrl(uiUrl),
    'content-length': '0',
  });
  res.end();
  return true;
};

/**
 * The picture that tells the hosted page this server is here: as wide
 * as BEACON_WIDTH, one pixel high with the local copy on, two with it
 * off, two more with HTTPS on (`pictureSays` in ../web/discover.js).
 * Returns true when the request was answered.
 */
export const serveBeacon = (req, res, p, ctx) => {
  if (p !== BEACON_PATH || !['GET', 'HEAD'].includes(req.method)) {
    return false;
  }
  if (ctx.allowOrigins.length === 0) {
    res.writeHead(404, { 'content-length': '0' });
    res.end();
    return true;
  }
  const body = `<svg xmlns="http://www.w3.org/2000/svg" width="${BEACON_WIDTH}" height="${(ctx.localUi ? 1 : 2) + (ctx.tls ? 2 : 0)}"/>`;
  res.writeHead(200, {
    'content-type': 'image/svg+xml',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
};

const TRUST_PAGE = (secure, port, uiUrl, fingerprint) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>meta-sovereign server</title></head><body>
<p>Certificate SHA-256: <code>${fingerprint}</code></p>
${
  secure
    ? `<h1>This browser trusts the meta-sovereign server</h1>
<p>The app can now reach it at https://127.0.0.1:${port} by itself.</p>
<p><a href="${uiUrl}">Back to the app</a></p>`
    : `<h1>meta-sovereign server</h1>
<p>To let Safari reach this server from the app, open
<a href="https://127.0.0.1:${port}/trust">https://127.0.0.1:${port}/trust</a>,
choose Show Details, then visit this website, and enter your password.
Or run <code>node js/bin/meta-sovereign.js trust</code>.</p>`
}
</body></html>
`;

/**
 * `/trust`: where Safari is sent to trust the server's certificate; over
 * HTTPS it says the browser now trusts it. Returns true when answered.
 */
export const serveTrust = (req, res, p, ctx) => {
  if (p !== '/trust' || !ctx.tls || !['GET', 'HEAD'].includes(req.method)) {
    return false;
  }
  const port = ctx.port ?? req.socket?.localPort ?? 8787;
  const body = TRUST_PAGE(
    Boolean(req.socket?.encrypted),
    port,
    ctx.uiUrl,
    ctx.tls.fingerprint
  );
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
};
