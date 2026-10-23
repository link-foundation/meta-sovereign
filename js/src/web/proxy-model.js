// The connection proxy's pure parts, shared by the page and the server
// (R-Y192; learned, never copied): the checks of a host and a port, and
// the t.me/proxy, t.me/socks, tg://proxy and tg://socks links that open
// the proxy dialog prefilled (nothing is saved until it is confirmed).

const HOSTS = /^(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)$/i;
const LABEL = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)$/;
const IPV4 =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6 = /^[0-9A-Fa-f:.]{2,45}$/;
const SECRET_FORM = /^[A-Za-z0-9_-]{16,512}$/;

const ipv6 = (host) => {
  if (!IPV6.test(host) || host.split(':').length < 3) {
    return false;
  }
  try {
    return new URL(`http://[${host}]/`).hostname !== '';
  } catch {
    return false;
  }
};

/** Whether `host` is a hostname or an IP address (no scheme, path, port). */
export const validHost = (host) => {
  if (typeof host !== 'string' || host !== host.trim() || host.length > 253) {
    return false;
  }
  if (IPV4.test(host) || ipv6(host)) {
    return true;
  }
  // 1.2.3 or 999.1.1.1 is a malformed address, not a name.
  return (
    host.split('.').every((label) => LABEL.test(label)) &&
    !/^[0-9.]+$/.test(host)
  );
};

/** The port as a number (a digit string too), or null outside 1–65535. */
export const portOf = (value) => {
  const n =
    typeof value === 'string' && /^\d{1,5}$/.test(value)
      ? Number(value)
      : value;
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null;
};

/** Whether a secret has the characters of hex or base64url (a first look). */
export const secretLooksRight = (secret) =>
  typeof secret === 'string' && SECRET_FORM.test(secret);

const proxyPath = (url) => {
  if (url.protocol === 'tg:') {
    return url.hostname;
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !HOSTS.test(url.hostname) ||
    url.username ||
    url.password
  ) {
    return null;
  }
  return url.pathname.replace(/^\/+|\/+$/g, '');
};

/**
 * What a proxy link names, or null: `{ kind: 'mtproto', host, port,
 * secret }` for t.me/proxy?server=&port=&secret= and `{ kind: 'socks5',
 * host, port, username, password }` for t.me/socks?server=&port=&user=&pass=
 * (and the tg:// forms). Only the host and port are checked here; the
 * server checks the rest when the dialog's Save is pressed.
 */
export const parseProxyLink = (href) => {
  let url;
  try {
    url = new URL(String(href ?? '').trim());
  } catch {
    return null;
  }
  const path = proxyPath(url);
  if (path !== 'proxy' && path !== 'socks') {
    return null;
  }
  const query = url.searchParams;
  const host = query.get('server');
  const port = portOf(query.get('port'));
  if (!validHost(host) || port === null) {
    return null;
  }
  return path === 'proxy'
    ? { kind: 'mtproto', host, port, secret: query.get('secret') ?? '' }
    : {
        kind: 'socks5',
        host,
        port,
        username: query.get('user') ?? '',
        password: query.get('pass') ?? '',
      };
};

const EVENT = 'ms-proxy-open';

/**
 * Asks the proxy dialog (mounted once, in the app) to open, prefilled
 * from `prefill` (a parsed link) when given. Saves nothing.
 */
export const openProxyDialog = (prefill = null) =>
  globalThis.dispatchEvent?.(new CustomEvent(EVENT, { detail: { prefill } }));

/** Opens the dialog for a proxy link; false when `href` is not one. */
export const openProxyLink = (href) => {
  const link = parseProxyLink(href);
  if (!link) {
    return false;
  }
  openProxyDialog(link);
  return true;
};

export const PROXY_EVENT = EVENT;
