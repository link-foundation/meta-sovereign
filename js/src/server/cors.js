/**
 * Cross-origin access to the local server (issue #37).
 *
 * The hosted web app (GitHub Pages) and the mobile WebViews run on
 * origins other than the server's own `http://127.0.0.1:<port>`, so a
 * browser only lets them read `/api/status` — and upgrade from the
 * restricted offline mode to the full app — when the server answers
 * with CORS headers for their origin. The server keeps listening on
 * loopback only; this module decides *which web pages* may use it.
 *
 * Policy:
 *   - requests without an `Origin` header (curl, the CLI, Node) and
 *     same-origin requests (the SPA the server serves itself, the
 *     Electron window) are untouched;
 *   - origins on the allow-list get `Access-Control-Allow-Origin`
 *     echoed back, plus a preflight answer that also opts in to
 *     Chrome's Private Network Access check;
 *   - every other origin gets no CORS headers, a 403 on preflight and
 *     a 403 on state-changing methods, so a random website cannot
 *     post `text/plain` bodies (which skip preflight) to the store.
 *
 * The allow-list defaults to the official hosted app plus the
 * Capacitor WebView origins, and can be replaced with the
 * `MS_ALLOW_ORIGINS` environment variable or `serve --allow-origin=`
 * (comma/space separated; `none` disables cross-origin access).
 */

export const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  'https://link-foundation.github.io',
  'https://localhost',
  'capacitor://localhost',
]);

const SAFE_METHODS = new Set(['GET', 'HEAD']);
const ALLOWED_METHODS = 'GET, HEAD, PUT, POST, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'content-type';

/** Normalise one configured entry to a bare origin, or null. */
const toOrigin = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw);
    // `new URL('capacitor://localhost').origin` is the string "null",
    // so non-special schemes are rebuilt by hand.
    return url.origin !== 'null' ? url.origin : `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
};

/**
 * Build the allow-list from an array, a comma/space separated string,
 * or nothing (`MS_ALLOW_ORIGINS`, then the defaults). `none` (alone)
 * means "no cross-origin pages".
 * @param {string|string[]|null|undefined} value
 * @returns {string[]}
 */
export const parseAllowedOrigins = (value = process.env.MS_ALLOW_ORIGINS) => {
  if (value === undefined || value === null || value === '') {
    return [...DEFAULT_ALLOWED_ORIGINS];
  }
  const list = Array.isArray(value) ? value : String(value).split(/[,\s]+/);
  if (list.length === 1 && String(list[0]).trim() === 'none') {
    return [];
  }
  return [...new Set(list.map(toOrigin).filter(Boolean))];
};

const isSameOrigin = (req, origin) =>
  origin === `http://${req.headers.host ?? ''}`;

/**
 * Classify a request's `Origin` header.
 * @returns {'none'|'same'|'allowed'|'denied'}
 */
export const classifyOrigin = (req, allowed) => {
  const origin = req.headers.origin;
  if (!origin) {
    return 'none';
  }
  if (isSameOrigin(req, origin)) {
    return 'same';
  }
  return allowed.includes(origin) ? 'allowed' : 'denied';
};

const writeEmpty = (res, status) => {
  res.writeHead(status, { 'content-length': '0' });
  res.end();
};

/**
 * Apply the policy. Returns true when the response was already sent
 * (preflight answered or request refused) and routing must stop.
 */
export const handleCors = (req, res, allowed) => {
  const verdict = classifyOrigin(req, allowed);
  if (verdict === 'allowed') {
    res.setHeader('access-control-allow-origin', req.headers.origin);
    res.setHeader('vary', 'Origin');
  }
  const preflight =
    req.method === 'OPTIONS' && req.headers['access-control-request-method'];
  if (preflight) {
    if (verdict !== 'allowed') {
      writeEmpty(res, 403);
      return true;
    }
    res.setHeader('access-control-allow-methods', ALLOWED_METHODS);
    res.setHeader('access-control-allow-headers', ALLOWED_HEADERS);
    res.setHeader('access-control-max-age', '600');
    if (req.headers['access-control-request-private-network'] === 'true') {
      res.setHeader('access-control-allow-private-network', 'true');
    }
    writeEmpty(res, 204);
    return true;
  }
  if (verdict === 'denied' && !SAFE_METHODS.has(req.method)) {
    writeEmpty(res, 403);
    return true;
  }
  return false;
};
