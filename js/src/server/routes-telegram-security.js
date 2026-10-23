// Security extras of Privacy and Security (R-Y177): the routes of the POSTS
// table in routes-telegram.js, each validated strictly before the account
// is asked. A password or a code in a body is passed on and never kept.
//
// Its routes:
//   POST /api/telegram/security        -> { ok, password: { has, hint,
//                                         hasRecovery, emailPending,
//                                         emailPattern, resetPending },
//                                         accountTtlDays, content: {
//                                         enabled, canChange } }
//   POST /api/telegram/password-set {current?, password, hint?, email?}
//                                      -> { ok } or { ok: false, code:
//                                         'email-unconfirmed', codeLength }
//   POST /api/telegram/password-remove {current} -> { ok }
//   POST /api/telegram/password-email-confirm {code}  -> { ok }
//   POST /api/telegram/password-email-resend          -> { ok }
//   POST /api/telegram/password-email-cancel          -> { ok }
//   POST /api/telegram/account-ttl-set {days}  -> { ok, days } 30/90/180/365
//   POST /api/telegram/sensitive-set {enabled} -> { ok, enabled }
//   POST /api/telegram/session-settings {hash, secretChats, calls}
//                                      -> { ok, secretChats, calls }
//   POST /api/telegram/session-ttl-set {days}  -> { ok, days } 7..365

import {
  ACCOUNT_TTL_DAYS,
  SESSION_TTL_DAYS,
  PASSWORD_MAX,
  HINT_MAX,
} from '../sources/telegram-security.js';

const NOT_SUPPORTED = [400, { error: 'not supported', code: 'bad-request' }];

const route = (method, valid, pick, message) => async (account, body) => {
  if (!valid(body)) {
    return [400, { error: message, code: 'bad-request' }];
  }
  return typeof account[method] === 'function'
    ? [200, await account[method](pick(body))]
    : NOT_SUPPORTED;
};

const str = (v, max, min = 0) =>
  typeof v === 'string' && v.length >= min && v.length <= max;
const optional = (v, ok) => v === undefined || ok(v);
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
const none = () => true;

export const SECURITY_POSTS = {
  security: route('securityState', none, () => ({}), 'no security'),
  'password-set': route(
    'setPassword',
    (b) =>
      str(b.password, PASSWORD_MAX, 1) &&
      optional(b.current, (v) => str(v, PASSWORD_MAX)) &&
      optional(b.hint, (v) => str(v, HINT_MAX)) &&
      optional(b.email, (v) => v === '' || (str(v, 320) && EMAIL.test(v))),
    (b) => ({
      current: b.current,
      password: b.password,
      hint: b.hint,
      email: b.email,
    }),
    'a password, an optional hint and email required'
  ),
  'password-remove': route(
    'removePassword',
    (b) => str(b.current, PASSWORD_MAX, 1),
    (b) => ({ current: b.current }),
    'the current password required'
  ),
  'password-email-confirm': route(
    'confirmPasswordEmail',
    (b) => typeof b.code === 'string' && /^[0-9A-Za-z]{1,16}$/.test(b.code),
    (b) => ({ code: b.code }),
    'the code required'
  ),
  'password-email-resend': route(
    'resendPasswordEmail',
    none,
    () => ({}),
    'no email'
  ),
  'password-email-cancel': route(
    'cancelPasswordEmail',
    none,
    () => ({}),
    'no email'
  ),
  'account-ttl-set': route(
    'setAccountTtl',
    (b) => ACCOUNT_TTL_DAYS.includes(b.days),
    (b) => ({ days: b.days }),
    '30, 90, 180 or 365 days required'
  ),
  'sensitive-set': route(
    'setSensitive',
    (b) => typeof b.enabled === 'boolean',
    (b) => ({ enabled: b.enabled }),
    'enabled required as a boolean'
  ),
  'session-settings': route(
    'setSessionSettings',
    (b) =>
      /^-?\d{1,20}$/.test(String(b.hash ?? '')) &&
      typeof b.secretChats === 'boolean' &&
      typeof b.calls === 'boolean',
    (b) => ({
      hash: String(b.hash),
      secretChats: b.secretChats,
      calls: b.calls,
    }),
    'hash, secretChats and calls required'
  ),
  'session-ttl-set': route(
    'setSessionTtl',
    (b) => SESSION_TTL_DAYS.includes(b.days),
    (b) => ({ days: b.days }),
    'a period of days required'
  ),
};
