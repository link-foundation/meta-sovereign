// Moderation, ownership and left channels (R-Y200): the routes of the POSTS
// table in routes-telegram.js, each validated strictly before the account
// is asked. The sources validate again; this keeps junk off the account.
//
// Its routes:
//   POST /api/telegram/moderate-user {chat, user, ids?, reportSpam?, ban?,
//                       deleteAll?} -> { ok, deleted } a supergroup's
//                       member reported (needs ids), banned and/or all
//                       their messages deleted (R-Y200)
//   POST /api/telegram/not-spam {chat, msgId} -> { ok } an anti-spam
//                       deletion reported as a false positive (R-Y200)
//   POST /api/telegram/convert-gigagroup {chat, confirm: true} -> { ok } a
//                       supergroup made a broadcast group, no undo (R-Y200)
//   POST /api/telegram/transfer-ownership {chat, user, password} -> { ok }
//                       the chat handed over; the 2-Step Verification
//                       password is checked by SRP, never kept (R-Y200)
//   POST /api/telegram/left-channels {offset?} -> { ok, channels, next } the
//                       channels the user left, read only (R-Y200)

import { moderationBody } from '../sources/telegram-moderation.js';
import { PASSWORD_MAX } from '../sources/telegram-ownership.js';

const CHANNEL = /^-100\d{1,20}$/;
const CHAT = /^-\d{1,20}$/;
const USER = /^\d{1,20}$/;
const MSG = /^\d{1,12}$/;
const OFFSET = /^\d{1,6}$/;

export const invalid = (what) => [400, { error: what, code: 'bad-request' }];

// Calls `method` of the account with `pick(body)` (the body itself unless
// told) when `ok` says it is valid.
export const route =
  (method, what, ok, pick = (body) => body) =>
  async (account, body) =>
    ok(body) && typeof account[method] === 'function'
      ? [200, await account[method](pick(body))]
      : invalid(what);

export const ADMIN_EXTRAS_POSTS = {
  'moderate-user': route(
    'moderateUser',
    'chat, user and what to do required',
    moderationBody
  ),
  'not-spam': route(
    'notSpam',
    'chat and message required',
    (b) => CHANNEL.test(String(b.chat ?? '')) && MSG.test(String(b.msgId ?? ''))
  ),
  'convert-gigagroup': route(
    'convertToGigagroup',
    'chat and confirmation required',
    (b) => CHANNEL.test(String(b.chat ?? '')) && b.confirm === true
  ),
  'transfer-ownership': route(
    'transferOwnership',
    'chat, user and password required',
    (b) =>
      CHAT.test(String(b.chat ?? '')) &&
      USER.test(String(b.user ?? '')) &&
      typeof b.password === 'string' &&
      b.password !== '' &&
      b.password.length <= PASSWORD_MAX
  ),
  'left-channels': route(
    'leftChannels',
    'offset must be a number',
    (b) => b.offset === undefined || OFFSET.test(String(b.offset))
  ),
};
