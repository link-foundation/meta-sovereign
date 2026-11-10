import { parseTelegramLink } from './telegram-links.js';
import { followRetryPolicy, followTimeout } from './retry.js';

export const backlinkFailure = (code) =>
  Object.assign(new Error(code), { code });
export const backlinkInteger = (value, fallback, min, max) => {
  const n = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw backlinkFailure('bad-request');
  }
  return n;
};
export const backlinkPeer = (value, source = 'vk') => {
  const text = String(value ?? '');
  if (source === 'telegram') {
    if (
      (typeof value !== 'string' && !Number.isSafeInteger(value)) ||
      !/^-[1-9]\d{0,23}$/u.test(text)
    ) {
      throw backlinkFailure('bad-request');
    }
    return text;
  }
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
  const source = body.source ?? 'vk';
  if (!['vk', 'telegram'].includes(source)) {
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
  const chats = [
    ...new Set(body.chats.map((chat) => backlinkPeer(chat, source))),
  ];
  const target = backlinkUrl(body.backlink);
  const monitorMs = backlinkInteger(body.monitorMs, 200000, 1000, 3600000);
  return {
    source,
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
const known = new Set([
  'bad-request',
  'unsupported',
  'not-connected',
  'user-account-required',
  'cleanup-unavailable',
  'account-changed',
  'target-changed',
  'target-unavailable',
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
const telegramError = (error) => {
  const waitKind =
    {
      FloodWaitError: 'FLOOD_WAIT',
      SlowModeWaitError: 'SLOWMODE_WAIT',
      FloodTestPhoneWaitError: 'FLOOD_TEST_PHONE_WAIT',
    }[error?.constructor?.name] ?? 'FLOOD_WAIT';
  const rpc =
    error?.errorMessage === 'FLOOD' &&
    Number.isSafeInteger(error.seconds) &&
    error.seconds >= 0 &&
    error.seconds <= 31536000
      ? `${waitKind}_${error.seconds}`
      : error?.errorMessage;
  const refused =
    typeof rpc === 'string' &&
    /^[A-Z][A-Z0-9_]{0,95}$/u.test(rpc) &&
    !/TIMEOUT|INTERNAL|RPC_CALL_FAIL|WORKER_BUSY/u.test(rpc) &&
    !(Number(error.code) >= 500);
  return refused
    ? {
        code: /^(?:FLOOD|SLOWMODE_WAIT)(?:_|$)/u.test(rpc)
          ? 'flood-wait'
          : 'provider-refused',
        providerError: rpc,
      }
    : null;
};
const vkError = (code) =>
  code === 6 ? 'rate-limited' : code === 14 ? 'captcha' : 'provider-refused';
export const backlinkError = (error, { write = false } = {}) => {
  if (Number.isSafeInteger(error?.vkCode)) {
    return { code: vkError(error.vkCode), providerCode: error.vkCode };
  }
  const refusal = telegramError(error);
  if (refusal) {
    return refusal;
  }
  const code =
    followTimeout(error) && !write
      ? 'timeout'
      : known.has(error?.code)
        ? error.code
        : write
          ? 'outcome-unknown'
          : 'read-failed';
  return { code };
};
