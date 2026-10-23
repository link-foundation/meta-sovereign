// Statistics of a channel or a supergroup (R-Y167): the routes of the
// POSTS table in routes-telegram.js, read-only, each validated strictly
// before the account is asked.
//
// Its routes:
//   POST /api/telegram/chat-stats {chat} -> { ok, kind, period, overview,
//                       graphs, posts | posters, admins, inviters } chat a
//                       channel or supergroup id (-100N)
//   POST /api/telegram/stats-graph {chat, token, x?} -> { ok, graph } token
//                       a non-empty string of at most 1 KB; x the zoomed
//                       point (digits)

import { MAX_TOKEN } from '../sources/telegram-stats.js';

const CHANNEL = /^-100\d{1,15}$/;

export const STATS_POSTS = {
  'chat-stats': async (account, body) =>
    CHANNEL.test(String(body.chat ?? '')) &&
    typeof account.chatStats === 'function'
      ? [200, await account.chatStats({ chat: body.chat })]
      : [400, { error: 'chat required', code: 'bad-request' }],
  'stats-graph': async (account, body) =>
    CHANNEL.test(String(body.chat ?? '')) &&
    typeof body.token === 'string' &&
    body.token.length > 0 &&
    body.token.length <= MAX_TOKEN &&
    (body.x === undefined || /^\d{1,20}$/.test(String(body.x))) &&
    typeof account.statsGraph === 'function'
      ? [
          200,
          await account.statsGraph({
            chat: body.chat,
            token: body.token,
            ...(body.x === undefined ? {} : { x: String(body.x) }),
          }),
        ]
      : [400, { error: 'chat and token required', code: 'bad-request' }],
};
