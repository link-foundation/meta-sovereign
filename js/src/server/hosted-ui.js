/**
 * Which web page is the app's face (R-Y58, R-Y59).
 *
 * By default it is the hosted one on GitHub Pages: a static bundle that
 * finds this server (./../web/discover.js) and becomes the full app
 * through it, so the server does not have to host a web site. The copy
 * the server serves itself stays as a fallback — for Safari, which does
 * not let an https page talk to http://127.0.0.1, and for a machine
 * without internet — and can be turned off (`serve --local-ui=false`
 * or `MS_LOCAL_UI=off`); `/` then sends the browser to the hosted app,
 * told where this server is.
 *
 * `serve --ui-url=` (or `MS_UI_URL`) names another hosted copy, a
 * fork's Pages for example; its origin is allowed to use the server.
 */

export const HOSTED_UI_URL =
  'https://link-foundation.github.io/meta-sovereign/';

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

/** Whether the server serves its own copy of the app (default yes). */
export const localUiEnabled = (value = process.env.MS_LOCAL_UI) =>
  value === undefined || value === null || value === true
    ? true
    : !OFF.has(String(value).trim().toLowerCase());

/** The hosted app, told which local server to use. */
export const hostedLink = (uiUrl, serverOrigin) => {
  const url = new URL(hostedUiUrl(uiUrl));
  if (serverOrigin) {
    url.searchParams.set('server', serverOrigin);
  }
  return url.href;
};

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
  const origin = `http://${req.headers.host ?? '127.0.0.1'}`;
  res.writeHead(302, {
    location: hostedLink(uiUrl, origin),
    'content-length': '0',
  });
  res.end();
  return true;
};
