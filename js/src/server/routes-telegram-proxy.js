// The connection proxy (R-Y192; learned, never copied): the routes of the
// POSTS table in routes-telegram.js, each validated before the account is
// asked. The password and the secret are write-only: no answer ever holds
// them, nor an error, only `passwordSet` / `secretSet`.
//
// Its routes:
//   POST /api/telegram/proxy-get {} -> { ok, proxy } the saved setting:
//                       { kind: 'none' }, { kind: 'socks5', host, port,
//                       username, passwordSet } or { kind: 'mtproto',
//                       host, port, secretSet }
//   POST /api/telegram/proxy-save {kind, host?, port?, username?,
//                       password?, secret?} -> { ok, proxy } kind none,
//                       socks5 or mtproto; host a hostname or IP (no
//                       scheme), port 1 to 65535, a secret hex or
//                       base64url. A password or secret left out keeps the
//                       saved one (same host only), an empty password
//                       clears it. Saving reconnects with the new proxy.
//                       A bad field is a 400 with code bad-host,
//                       bad-port, bad-login, bad-secret, unsupported-secret
//                       or bad-kind
//   POST /api/telegram/proxy-check {host?, port?} -> { ok, host, port,
//                       reachable, ms } a short TCP connect to the proxy's
//                       address (the saved one when none is given)

const is = (body) => body && typeof body === 'object' && !Array.isArray(body);
const only = (body, keys) => Object.keys(body).every((k) => keys.includes(k));
const SAVE_KEYS = ['kind', 'host', 'port', 'username', 'password', 'secret'];
const FIELD = (v) => v === undefined || typeof v === 'string';
const PORT = (v) =>
  v === undefined || typeof v === 'number' || typeof v === 'string';

const BAD = [400, { error: 'bad request', code: 'bad-request' }];

// The account's answer: a refused field is a 400 naming only its code.
const answer = (result) =>
  result?.ok
    ? [200, result]
    : [400, { error: 'bad request', code: result?.code ?? 'bad-request' }];

const call = (method, valid) => async (account, body) =>
  is(body) && valid(body) && typeof account[method] === 'function'
    ? answer(await account[method](body))
    : BAD;

export const PROXY_POSTS = {
  'proxy-get': call('proxyGet', (b) => Object.keys(b).length === 0),
  'proxy-save': call(
    'proxySave',
    (b) =>
      only(b, SAVE_KEYS) &&
      typeof b.kind === 'string' &&
      ['host', 'username', 'password', 'secret'].every((k) => FIELD(b[k])) &&
      PORT(b.port)
  ),
  'proxy-check': call(
    'proxyCheck',
    (b) => only(b, ['host', 'port']) && FIELD(b.host) && PORT(b.port)
  ),
};
