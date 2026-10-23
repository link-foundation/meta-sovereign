// Privacy and security (R-Y139): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.

import {
  PRIVACY_KEYS,
  CHOICES,
  PAGE_MAX,
} from '../sources/telegram-privacy.js';
import { TTL_PERIODS } from '../sources/telegram-ttl.js';

const NOT_SUPPORTED = [400, { error: 'not supported', code: 'bad-request' }];

// A plain route: `method` of the account, called with `pick(body)` when
// `valid(body)`.
const route = (method, valid, pick, message) => async (account, body) => {
  if (!valid(body)) {
    return [400, { error: message, code: 'bad-request' }];
  }
  return typeof account[method] === 'function'
    ? [200, await account[method](pick(body))]
    : NOT_SUPPORTED;
};

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const validPaging = (b) =>
  (b.offset === undefined || isInt(b.offset, 0, 1e9)) &&
  (b.limit === undefined || isInt(b.limit, 1, PAGE_MAX));

export const PRIVACY_POSTS = {
  privacy: route(
    'privacyRules',
    () => true,
    () => ({}),
    'no privacy'
  ),
  'privacy-set': route(
    'setPrivacy',
    (b) =>
      Object.hasOwn(PRIVACY_KEYS, b.key) &&
      CHOICES.includes(b.choice) &&
      (b.key !== 'addedByPhone' || b.choice !== 'nobody'),
    (b) => ({ key: b.key, choice: b.choice }),
    'a known key and everybody, contacts or nobody required'
  ),
  sessions: route(
    'sessions',
    () => true,
    () => ({}),
    'no sessions'
  ),
  'session-terminate': route(
    'terminateSession',
    (b) => /^-?\d{1,20}$/.test(String(b.hash ?? '')),
    (b) => ({ hash: String(b.hash) }),
    'hash required'
  ),
  'sessions-terminate-others': route(
    'terminateOthers',
    () => true,
    () => ({}),
    'no sessions'
  ),
  // The default auto-delete timer of new chats (R-Y151).
  'privacy-ttl': route(
    'defaultTtl',
    () => true,
    () => ({}),
    'no timer'
  ),
  'privacy-ttl-set': route(
    'setDefaultTtl',
    (b) => TTL_PERIODS.includes(b.period),
    (b) => ({ period: b.period }),
    'a period of Telegram required'
  ),
  blocked: route(
    'blockedUsers',
    validPaging,
    (b) => ({ offset: b.offset ?? 0, limit: b.limit ?? 50 }),
    'offset and limit required as numbers'
  ),
  unblock: route(
    'unblockUser',
    (b) =>
      /^\d{1,20}$/.test(String(b.id ?? '')) &&
      /^-?\d{1,20}$/.test(String(b.accessHash ?? '')),
    (b) => ({ id: String(b.id), accessHash: String(b.accessHash) }),
    'id and accessHash required'
  ),
};
