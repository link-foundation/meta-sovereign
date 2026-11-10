import { parseTelegramLink } from './telegram-links.js';
import { followRetryPolicy } from './retry.js';

export const backlinkFailure = (code) =>
  Object.assign(new Error(code), { code });
export const backlinkInteger = (value, fallback, min, max) => {
  const n = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw backlinkFailure('bad-request');
  }
  return n;
};
export const backlinkPeer = (value) => {
  const text = String(value ?? '');
  const n = /^\d{1,10}$/.test(text) ? Number(text) : NaN;
  if (n <= 2000000000 || n > 2147483647) {
    throw backlinkFailure('bad-request');
  }
  return String(backlinkInteger(n, NaN, 2000000001, 2147483647));
};
export const backlinkUrl = (value) => {
  const target = parseTelegramLink(value);
  if (target && ['public', 'invite'].includes(target.kind)) {
    return { source: 'telegram', url: target.url };
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw backlinkFailure('bad-request');
  }
  if (
    url.protocol === 'https:' &&
    url.hostname === 'vk.me' &&
    !url.username &&
    !url.password &&
    !url.port &&
    !url.search &&
    !url.hash &&
    /^\/join\/[a-z\d_-]{8,256}$/iu.test(url.pathname)
  ) {
    return { source: 'vk', url: url.href };
  }
  throw backlinkFailure('bad-request');
};
export const backlinkConfig = (body = {}) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw backlinkFailure('bad-request');
  }
  if ((body.source ?? 'vk') !== 'vk') {
    throw backlinkFailure('unsupported');
  }
  if (
    !Array.isArray(body.chats) ||
    body.chats.length < 1 ||
    body.chats.length > 100 ||
    (body.deleteIncoming !== undefined &&
      typeof body.deleteIncoming !== 'boolean')
  ) {
    throw backlinkFailure('bad-request');
  }
  const chats = [...new Set(body.chats.map(backlinkPeer))];
  const target = backlinkUrl(body.backlink);
  const monitorMs = backlinkInteger(body.monitorMs, 200000, 1000, 3600000);
  return {
    source: 'vk',
    targetSource: target.source,
    chats,
    backlink: target.url,
    monitorMs,
    intervalMs: backlinkInteger(body.intervalMs, 30000, 1000, 300000),
    delayMs: backlinkInteger(body.delayMs, 0, 0, 60000),
    deleteIncoming: body.deleteIncoming === true,
    historyLimit: backlinkInteger(body.historyLimit, 200, 1, 200),
    retry: followRetryPolicy(body.retry),
  };
};

// Public failures contain provider codes, never raw messages, request bodies,
// access tokens or captcha URLs. Preserve a refusal separately from uncertainty.
export const backlinkError = (error, { write = false } = {}) => {
  const vkCode = Number.isSafeInteger(error?.vkCode) ? error.vkCode : null;
  const known = new Set([
    'bad-request',
    'unsupported',
    'not-connected',
    'account-changed',
    'target-changed',
    'not-writable',
    'provider-response',
    'timeout',
    'cancelled',
    'stopped',
    'busy',
    'plan-expired',
    'not-found',
    'confirmation-required',
    'outcome-unknown',
  ]);
  const code =
    vkCode !== null
      ? vkCode === 6
        ? 'rate-limited'
        : vkCode === 14
          ? 'captcha'
          : 'provider-refused'
      : known.has(error?.code)
        ? error.code
        : write
          ? 'outcome-unknown'
          : 'read-failed';
  return { code, ...(vkCode === null ? {} : { providerCode: vkCode }) };
};
