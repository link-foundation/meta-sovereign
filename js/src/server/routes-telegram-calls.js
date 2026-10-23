// The recent calls list (R-Y163): the route of the POSTS table in
// routes-telegram.js, validated strictly before the account is asked.
// Read-only.
//
// Its routes:
//   POST /api/telegram/calls {missed?, offsetId?} -> { ok, calls, next }
//                       calls: [{ chat, name, id, date, out, video, missed,
//                       duration }] newest first; next: the offsetId to ask
//                       again with, or null

import { validCallsRequest } from '../sources/telegram-calls.js';

export const CALLS_POSTS = {
  calls: async (account, body) =>
    validCallsRequest(body) && typeof account.callsList === 'function'
      ? [200, await account.callsList(body)]
      : [400, { error: 'bad request', code: 'bad-request' }],
};
