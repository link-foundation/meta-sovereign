/**
 * The connection proxy, as Telegram Desktop's Settings → Advanced →
 * Connection type has it (R-Y192; learned, never copied): direct (the
 * default), a SOCKS5 proxy (host, port, optional user and password) or
 * an MTProto proxy (host, port, secret).
 *
 * - `proxyGet()`   — the saved setting as the page may see it: the kind,
 *   host, port and user name, and only whether a password or a secret
 *   is set (`passwordSet`, `secretSet`). Those two are write-only;
 * - `proxySave(body)` — validated and kept (under `secret:telegram:proxy`
 *   beside the session, never in it). A password or secret left out
 *   keeps the saved one (for the same host only); an empty password clears it. The connection is
 *   then dropped and opened again through the existing reopen path, so
 *   the new proxy is used at once (if reopening fails, the next poll
 *   opens it, still through the new proxy);
 * - `proxyCheck({host, port})` — a short TCP connect to the proxy's
 *   address (the user's own action), its answer `{reachable, ms}`. The
 *   probe is injected (`env.proxyProbe`) so tests never open a socket.
 *
 * Neither the password nor the secret is ever logged, returned or put in
 * an error. GramJS takes the proxy in `proxyOptions` form (see
 * `gramjsClientFactory`). Voice and video calls are set up through
 * Telegram's own relays by the page, not this client, so there is no
 * "use proxy for calls" switch.
 */

import net from 'node:net';
import { portOf, validHost } from '../web/proxy-model.js';

export { portOf, validHost };

export const PROXY_ID = 'secret:telegram:proxy';
export const KINDS = Object.freeze(['none', 'socks5', 'mtproto']);

const HEX = /^[0-9a-f]+$/i;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const CHECK_MS = 5000;

/**
 * An MTProto secret in the forms proxy links carry (hex, or base64url)
 * as `{ hex }` (16 bytes, or 17 with the leading dd of "secure"
 * proxies), `{ error: 'unsupported-secret' }` for the fake-TLS ee form
 * GramJS cannot speak, or null when it is not a secret at all.
 */
export const secretOf = (value) => {
  if (typeof value !== 'string' || value.length < 16 || value.length > 512) {
    return null;
  }
  let bytes = null;
  if (HEX.test(value) && value.length % 2 === 0) {
    bytes = Buffer.from(value, 'hex');
  } else if (BASE64URL.test(value) && value.length % 4 !== 1) {
    bytes = Buffer.from(value, 'base64url');
  }
  if (!bytes) {
    return null;
  }
  if (bytes[0] === 0xee && bytes.length > 17) {
    return { error: 'unsupported-secret' };
  }
  const plain = bytes.length === 16;
  const secure = bytes.length === 17 && bytes[0] === 0xdd;
  return plain || secure ? { hex: bytes.toString('hex') } : null;
};

const fail = (code) => ({ ok: false, code });
const good = (value) => ({ ok: true, value });

const textOf = (value, max) =>
  typeof value === 'string' && Buffer.byteLength(value) <= max;

// A saved password or secret is kept only for the same server: it is
// never sent to another host the user types in.
const sameServer = (body, before, kind) =>
  before?.kind === kind && before.host === body.host;

// A SOCKS5 login: a user name, a password only with one (RFC 1929: up to
// 255 bytes each). A password left out keeps the saved one.
const socksOf = (body, before) => {
  const username = body.username ?? '';
  const keep =
    body.password === undefined && sameServer(body, before, 'socks5');
  const password = keep ? (before.password ?? '') : (body.password ?? '');
  if (!textOf(username, 255) || !textOf(password, 255)) {
    return fail('bad-login');
  }
  return password && !username
    ? fail('bad-login')
    : good({ username, password });
};

const mtprotoOf = (body, before) => {
  if (body.secret === undefined && sameServer(body, before, 'mtproto')) {
    return good({ secret: before.secret });
  }
  const secret = secretOf(body.secret);
  if (!secret || secret.error) {
    return fail(secret?.error ?? 'bad-secret');
  }
  return good({ secret: secret.hex });
};

/**
 * A page's body checked into the setting to keep: `{ ok, value }` or
 * `{ ok: false, code }`. `before` is the saved one (for a password or
 * secret the body leaves out).
 */
export const validateProxy = (body, before = null) => {
  if (!body || typeof body !== 'object' || !KINDS.includes(body.kind)) {
    return fail('bad-kind');
  }
  if (body.kind === 'none') {
    return good({ kind: 'none' });
  }
  const port = portOf(body.port);
  if (!validHost(body.host)) {
    return fail('bad-host');
  }
  if (port === null) {
    return fail('bad-port');
  }
  const rest =
    body.kind === 'socks5' ? socksOf(body, before) : mtprotoOf(body, before);
  return rest.ok
    ? good({ kind: body.kind, host: body.host, port, ...rest.value })
    : rest;
};

/** What the page may see of a setting: no password, no secret. */
export const publicProxy = (setting) => {
  if (!setting || setting.kind === 'none' || !KINDS.includes(setting.kind)) {
    return { kind: 'none' };
  }
  const shown = { kind: setting.kind, host: setting.host, port: setting.port };
  return setting.kind === 'socks5'
    ? {
        ...shown,
        username: setting.username ?? '',
        passwordSet: Boolean(setting.password),
      }
    : { ...shown, secretSet: Boolean(setting.secret) };
};

/** The `proxy` option of GramJS's TelegramClient, or undefined (direct). */
export const proxyOptions = (setting) => {
  if (setting?.kind === 'socks5') {
    return {
      ip: setting.host,
      port: setting.port,
      socksType: 5,
      timeout: 10,
      ...(setting.username ? { username: setting.username } : {}),
      ...(setting.password ? { password: setting.password } : {}),
    };
  }
  if (setting?.kind === 'mtproto') {
    return {
      ip: setting.host,
      port: setting.port,
      MTProxy: true,
      secret: setting.secret,
    };
  }
  return undefined;
};

/** The saved setting (or null), read from the store; never throws. */
export const readProxy = async (store) => {
  try {
    const record = await store?.get(PROXY_ID);
    const parsed = JSON.parse(record?.value ?? 'null');
    const checked = parsed && validateProxy(parsed, parsed);
    return checked?.ok ? checked.value : null;
  } catch {
    return null;
  }
};

/** A TCP connect to host:port; `{ reachable, ms }`. Opens a real socket. */
export const tcpProbe = ({ host, port, timeoutMs = CHECK_MS }) =>
  new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect({ host, port });
    const done = (reachable) => {
      socket.destroy();
      resolve({ reachable, ms: Date.now() - started });
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export const createProxy = (env) => {
  const proxyGet = async () => ({
    ok: true,
    proxy: publicProxy(await readProxy(env.store)),
  });

  const proxySave = async (body) => {
    const before = await readProxy(env.store);
    const checked = validateProxy(body, before);
    if (!checked.ok) {
      return { ok: false, code: checked.code };
    }
    if (!same(before ?? { kind: 'none' }, checked.value)) {
      await env.store.put({
        id: PROXY_ID,
        tokens: ['secret', 'telegram', 'proxy'],
        value: JSON.stringify(checked.value),
        updated: new Date(env.now?.() ?? Date.now()).toISOString(),
      });
      // The open connection used the old proxy: drop it and open anew.
      await env.connection?.disconnect?.();
      Promise.resolve(env.reopen?.()).catch(() => {});
    }
    env.log?.({
      level: 'info',
      event: 'telegram_proxy_saved',
      kind: checked.value.kind,
    });
    return { ok: true, proxy: publicProxy(checked.value) };
  };

  const proxyCheck = async (body = {}) => {
    const saved = await readProxy(env.store);
    const host = body.host ?? saved?.host;
    const port = portOf(body.port ?? saved?.port);
    if (!validHost(host)) {
      return { ok: false, code: 'bad-host' };
    }
    if (port === null) {
      return { ok: false, code: 'bad-port' };
    }
    const probe = env.proxyProbe ?? tcpProbe;
    const { reachable, ms } = await probe({ host, port, timeoutMs: CHECK_MS });
    return { ok: true, host, port, reachable: Boolean(reachable), ms };
  };

  return { proxyGet, proxySave, proxyCheck };
};
