import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  cloudAsset,
  CLOUD_SIGN_IN,
  CLOUD_SIGN_OUT,
  signInPage,
} from './cloud-pages.js';
import { BodyError, fail, json, readBytes } from './util.js';

const COOKIE = '__Host-ms-workspace';
const SESSION_SECONDS = 12 * 60 * 60;
const SESSION_LIMIT = 128;
const HEALTH = '/_cloud/health';
const isPage = (path) => path === '/' || path === '/index.html';
const isRead = (method) => method === 'GET' || method === 'HEAD';

const preventCaching = (res) => {
  const writeHead = res.writeHead.bind(res);
  res.setHeader('cache-control', 'no-store, no-transform');
  // Existing routes set media and static cache lifetimes for local usage.
  res.writeHead = (status, headers = {}) => {
    const fresh = Object.fromEntries(
      Object.entries(headers).filter(
        ([name]) => name.toLowerCase() !== 'cache-control'
      )
    );
    return writeHead(status, {
      ...fresh,
      'cache-control': 'no-store, no-transform',
    });
  };
};

const cookie = (value, maxAge) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

const getToken = (req) =>
  String(req.headers.cookie ?? '').match(
    /(?:^|;\s*)__Host-ms-workspace=([a-f0-9]{64})(?=;|$)/
  )?.[1];

const redirect = (res, location) => {
  res.writeHead(303, { location, 'content-length': '0' });
  res.end();
};

const createSessions = () => {
  const active = new Map();
  return {
    issue() {
      if (active.size >= SESSION_LIMIT) {
        return null;
      }
      const token = randomBytes(32).toString('hex');
      const expires = globalThis.setTimeout(
        () => this.revoke(token),
        SESSION_SECONDS * 1000
      );
      expires.unref();
      active.set(token, { expires, close: new Set() });
      return token;
    },
    get: (req) => active.get(getToken(req)),
    revoke(token) {
      const session = active.get(token);
      if (session) {
        active.delete(token);
        globalThis.clearTimeout(session.expires);
        session.close.forEach((close) => close());
      }
    },
    close() {
      for (const token of active.keys()) {
        this.revoke(token);
      }
    },
  };
};

const track = (session, stream) => {
  const stop = () => stream.destroy();
  session.close.add(stop);
  stream.once('close', () => session.close.delete(stop));
};

const keyFromForm = async (req) => {
  if (req.headers['content-type'] !== 'application/x-www-form-urlencoded') {
    throw new BodyError(
      415,
      'bad-content-type',
      'Submit the workspace sign-in form'
    );
  }
  const form = new URLSearchParams(
    (await readBytes(req, { limit: 256 })).toString('utf8')
  );
  return form.get('key') ?? '';
};

const createSignIn = (ownerKey, sessions, brand) => {
  const expected = Buffer.from(ownerKey, 'hex');
  let failed = 0;
  let windowStart = 0;
  return async (req, res) => {
    const supplied = await keyFromForm(req);
    if (
      /^[a-f0-9]{64}$/.test(supplied) &&
      timingSafeEqual(expected, Buffer.from(supplied, 'hex'))
    ) {
      const token = sessions.issue();
      if (!token) {
        return fail(
          res,
          503,
          'session-limit',
          'Sign out of another workspace session and try again'
        );
      }
      res.setHeader('set-cookie', cookie(token, SESSION_SECONDS));
      return redirect(res, '/');
    }
    const now = Date.now();
    if (now - windowStart >= 60_000) {
      failed = 0;
      windowStart = now;
    }
    failed += 1;
    if (failed > 20) {
      res.setHeader('retry-after', '60');
    }
    return signInPage(req, res, brand, failed > 20 ? 429 : 401);
  };
};

const sameOrigin = (req, origin, path) => {
  const supplied = req.headers.origin;
  if (!isRead(req.method) || supplied) {
    return supplied === origin;
  }
  const site = req.headers['sec-fetch-site'];
  // The entry page can be opened from a bookmark or followed from a link.
  return (
    isPage(path) ||
    path === CLOUD_SIGN_IN ||
    !site ||
    site === 'same-origin' ||
    site === 'none'
  );
};

export const createCloudAccess = ({ origin, host, ownerKey, brand }) => {
  if (globalThis.Bun || globalThis.Deno) {
    throw new Error(
      'serve-cloud requires Node.js for authenticated live streams'
    );
  }
  const sessions = createSessions();
  const socketAuthorized = new WeakSet();
  const signIn = createSignIn(ownerKey, sessions, brand);
  const correctHost = (req) => req.headers.host?.toLowerCase() === host;
  const publicRoute = async (req, res, path) => {
    if (req.method === 'GET' && path === HEALTH) {
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && path === CLOUD_SIGN_IN) {
      return sessions.get(req)
        ? redirect(res, '/')
        : signInPage(req, res, brand);
    }
    if (req.method === 'POST' && path === CLOUD_SIGN_IN) {
      return signIn(req, res);
    }
    return req.method === 'GET' ? cloudAsset(res, path, brand) : false;
  };
  return {
    brand,
    host,
    socketAuthorized,
    async allowHttp(req, res, path) {
      preventCaching(res);
      if (!correctHost(req)) {
        return fail(res, 421, 'bad-host', 'unexpected Host header');
      }
      res.setHeader('strict-transport-security', 'max-age=31536000');
      res.setHeader('referrer-policy', 'same-origin');
      if (!/^\/(?!\/)/.test(req.url)) {
        return fail(res, 400, 'bad-path', 'invalid workspace request path');
      }
      if (!sameOrigin(req, origin, path)) {
        return fail(res, 403, 'forbidden', 'origin is not allowed');
      }
      if ((await publicRoute(req, res, path)) !== false) {
        return false;
      }
      const session = sessions.get(req);
      if (!session) {
        res.setHeader('x-ms-workspace-session', 'required');
        return req.method === 'GET' && isPage(path)
          ? redirect(res, CLOUD_SIGN_IN)
          : fail(res, 401, 'workspace-sign-in', 'Sign in to the workspace');
      }
      if (req.method === 'POST' && path === CLOUD_SIGN_OUT) {
        sessions.revoke(getToken(req));
        res.setHeader('set-cookie', cookie('', 0));
        res.setHeader('clear-site-data', '"cache"');
        return redirect(res, CLOUD_SIGN_IN);
      }
      if (req.method === 'GET' && path === '/_cloud/session') {
        return json(res, 200, { ok: true });
      }
      // In-flight responses (including event streams and media) end when
      // their session ends. Business operations already in flight may finish.
      track(session, res);
      return true;
    },
    allowUpgrade(req, socket) {
      const session = sessions.get(req);
      if (!session || !correctHost(req) || req.headers.origin !== origin) {
        return false;
      }
      track(session, socket);
      socketAuthorized.add(req);
      return true;
    },
    close: () => sessions.close(),
  };
};
