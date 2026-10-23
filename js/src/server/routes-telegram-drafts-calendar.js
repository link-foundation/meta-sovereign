// Cloud drafts, the jump-to-date calendar's day counts and frequent
// contacts (R-Y207): the routes of the POSTS table in routes-telegram.js,
// each validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/drafts-sync {} -> { ok, drafts, cleared } the drafts
//                       Telegram holds, stored; those cleared elsewhere emptied
//   POST /api/telegram/drafts-clear {} -> { ok, cleared } every cloud draft
//                       deleted (messages.clearAllDrafts)
//   POST /api/telegram/calendar {chat, filter?, before?} -> { ok, days,
//                       first, total } the days with messages and their
//                       counts before the unix time `before` (offset paging)
//   POST /api/telegram/top-peers {} -> { ok, enabled, peers } frequent contacts
//   POST /api/telegram/top-peers-remove {chat} -> { ok } taken off the list
//   POST /api/telegram/top-peers-toggle {enabled} -> { ok, enabled } the
//                       list turned on or off

import { FILTERS } from '../sources/telegram-calendar.js';

const CHAT = /^-?\d{1,20}$/;
const bad = (error) => [400, { error, code: 'bad-request' }];
const has = (account, name) => typeof account[name] === 'function';

const plain = (name) => async (account) =>
  has(account, name) ? [200, await account[name]()] : bad('not supported');

export const DRAFTS_CALENDAR_POSTS = {
  'drafts-sync': plain('syncDrafts'),
  'drafts-clear': plain('clearAllDrafts'),
  'top-peers': plain('topPeers'),
  calendar: async (account, body) =>
    CHAT.test(String(body.chat ?? '')) &&
    (body.filter === undefined || FILTERS.includes(body.filter)) &&
    (body.before === undefined ||
      (Number.isInteger(body.before) && body.before >= 0)) &&
    has(account, 'calendar')
      ? [
          200,
          await account.calendar({
            chat: String(body.chat),
            ...(body.filter === undefined ? {} : { filter: body.filter }),
            ...(body.before === undefined ? {} : { before: body.before }),
          }),
        ]
      : bad('chat required'),
  'top-peers-remove': async (account, body) =>
    CHAT.test(String(body.chat ?? '')) && has(account, 'removeTopPeer')
      ? [200, await account.removeTopPeer({ chat: String(body.chat) })]
      : bad('chat required'),
  'top-peers-toggle': async (account, body) =>
    typeof body.enabled === 'boolean' && has(account, 'setTopPeers')
      ? [200, await account.setTopPeers({ enabled: body.enabled })]
      : bad('enabled required'),
};
