// Archive settings, logged-in websites and pinned Saved Messages chats
// (R-Y174): the routes of the POSTS table in routes-telegram.js, each
// validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/archive-settings -> { ok, settings: { archiveAndMute,
//                       keepUnmuted, keepFolders, hideReadMarks,
//                       requirePremium } }
//   POST /api/telegram/archive-settings-set {archiveAndMute, keepUnmuted,
//                       keepFolders, hideReadMarks, requirePremium} (all
//                       booleans) -> { ok, settings } the other fields of
//                       Telegram's settings are kept
//   POST /api/telegram/web-sessions     -> { ok, sessions: [{ hash, domain,
//                       bot, browser, platform, ip, region, created,
//                       active }] } websites logged in with Telegram
//   POST /api/telegram/web-session-reset {hash} -> { ok } one disconnected
//   POST /api/telegram/web-sessions-reset-all -> { ok } all disconnected
//   POST /api/telegram/saved-pin {peer, pinned} -> { ok, pinned } a chat of
//                       Saved Messages pinned or unpinned

import { ARCHIVE_FIELDS } from '../sources/telegram-account-extras.js';

const bad = (error) => [400, { error, code: 'bad-request' }];
const NOT_SUPPORTED = [400, { error: 'not supported', code: 'bad-request' }];

const run = async (account, method, arg) =>
  typeof account[method] === 'function'
    ? [200, await account[method](arg)]
    : NOT_SUPPORTED;

const validSettings = (b) =>
  Object.keys(ARCHIVE_FIELDS).every((key) => typeof b[key] === 'boolean');

export const ACCOUNT_EXTRAS_POSTS = {
  'archive-settings': (account) => run(account, 'archiveSettings'),
  'archive-settings-set': async (account, body) =>
    validSettings(body)
      ? run(
          account,
          'setArchiveSettings',
          Object.fromEntries(
            Object.keys(ARCHIVE_FIELDS).map((key) => [key, body[key]])
          )
        )
      : bad('five booleans required'),
  'web-sessions': (account) => run(account, 'webSessions'),
  'web-session-reset': async (account, body) =>
    /^-?\d{1,20}$/.test(String(body.hash ?? ''))
      ? run(account, 'webSessionReset', { hash: String(body.hash) })
      : bad('hash required'),
  'web-sessions-reset-all': (account) => run(account, 'webSessionsResetAll'),
  'saved-pin': async (account, body) =>
    /^-?\d{1,20}$/.test(String(body.peer ?? '')) &&
    typeof body.pinned === 'boolean'
      ? run(account, 'savedPin', {
          peer: String(body.peer),
          pinned: body.pinned,
        })
      : bad('peer and pinned required'),
};
