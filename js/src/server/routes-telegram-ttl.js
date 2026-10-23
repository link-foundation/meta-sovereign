// A chat's auto-delete timer and Saved Messages by chat (R-Y143): the
// routes of the POSTS table in routes-telegram.js, each validated
// strictly before the account is asked.

import { TTL_PERIODS } from '../sources/telegram-ttl.js';

const CHAT = /^-?\d{1,20}$/;
const USER = /^\d{1,20}$/;

const natural = (v) => Number.isInteger(v) && v >= 0;
const optional = (check) => (v) => v === undefined || check(v);

const validLimit = optional((v) => Number.isInteger(v) && v >= 1 && v <= 100);
const validOffsetPeer = optional((v) => v === '' || CHAT.test(String(v)));

const bad = (error) => [400, { error, code: 'bad-request' }];

const validDialogs = (b) =>
  optional(natural)(b.offsetDate) &&
  optional(natural)(b.offsetId) &&
  validOffsetPeer(b.offsetPeer) &&
  validLimit(b.limit);

const validHistory = (b) =>
  USER.test(String(b.chat ?? '')) &&
  CHAT.test(String(b.peer ?? '')) &&
  optional((v) => Number.isInteger(v) && v > 0)(b.before) &&
  validLimit(b.limit);

export const TTL_POSTS = {
  'history-ttl': async (account, body) =>
    CHAT.test(String(body.chat ?? '')) &&
    TTL_PERIODS.includes(body.period) &&
    typeof account.setHistoryTtl === 'function'
      ? [
          200,
          await account.setHistoryTtl({
            chat: String(body.chat),
            period: body.period,
          }),
        ]
      : bad('chat and a period required'),
  'saved-dialogs': async (account, body) =>
    validDialogs(body) && typeof account.savedDialogs === 'function'
      ? [
          200,
          await account.savedDialogs({
            offsetDate: body.offsetDate,
            offsetId: body.offsetId,
            offsetPeer: body.offsetPeer,
            limit: body.limit,
          }),
        ]
      : bad('bad paging'),
  'saved-history': async (account, body) =>
    validHistory(body) && typeof account.savedHistory === 'function'
      ? [
          200,
          await account.savedHistory({
            chat: String(body.chat),
            peer: String(body.peer),
            before: body.before,
            limit: body.limit,
          }),
        ]
      : bad('chat and peer required'),
  'saved-delete': async (account, body) =>
    CHAT.test(String(body.peer ?? '')) &&
    typeof account.savedDelete === 'function'
      ? [200, await account.savedDelete({ peer: String(body.peer) })]
      : bad('peer required'),
};
