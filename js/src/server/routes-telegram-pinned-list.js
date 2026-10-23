// The pinned messages list, similar channels and fact checks (R-Y166): the
// routes of the POSTS table in routes-telegram.js, each validated strictly
// before the account is asked.
//
// Its routes:
//   POST /api/telegram/pinned-list {chat, topMsgId?, offsetId?} -> { ok,
//                       messages, count, next } the chat's pinned messages,
//                       newest first, a page at a time (digits for the ids)
//   POST /api/telegram/unpin-all {chat, topMsgId?} -> { ok } every pinned
//                       message (of the forum topic) unpinned
//   POST /api/telegram/similar-channels {chat} -> { ok, channels: [{ chat,
//                       title, username, members, broadcast }] } chat a
//                       channel (-100…)
//   POST /api/telegram/similar-join {chat} -> { ok, chat } joins a channel
//                       (only the explicit Join click asks for it)
//   POST /api/telegram/fact-checks {chat, ids} -> { ok, items: [{ id,
//                       country, text, entities }] } ids 1 to 100 message ids

import { validPinnedRequest } from '../sources/telegram-pinned-list.js';
import { validFactRequest } from '../sources/telegram-fact-checks.js';

const CHANNEL = /^-100\d{1,15}$/;
const BAD = [400, { error: 'chat required', code: 'bad-request' }];

const optional = (body, ...names) =>
  Object.fromEntries(
    names
      .filter((name) => body[name] !== undefined)
      .map((name) => [name, String(body[name])])
  );

const channelRoute = (method) => async (account, body) =>
  CHANNEL.test(String(body.chat ?? '')) && typeof account[method] === 'function'
    ? [200, await account[method]({ chat: String(body.chat) })]
    : BAD;

const pinnedRoute = (method) => async (account, body) =>
  validPinnedRequest(body) && typeof account[method] === 'function'
    ? [
        200,
        await account[method]({
          chat: String(body.chat),
          ...optional(body, 'topMsgId', 'offsetId'),
        }),
      ]
    : BAD;

export const PINNED_LIST_POSTS = {
  'pinned-list': pinnedRoute('pinnedList'),
  'unpin-all': async (account, body) =>
    validPinnedRequest(body) &&
    body.offsetId === undefined &&
    typeof account.unpinAll === 'function'
      ? [
          200,
          await account.unpinAll({
            chat: String(body.chat),
            ...optional(body, 'topMsgId'),
          }),
        ]
      : BAD,
  'similar-channels': channelRoute('similarChannels'),
  'similar-join': channelRoute('similarJoin'),
  'fact-checks': async (account, body) =>
    validFactRequest(body) && typeof account.factChecks === 'function'
      ? [
          200,
          await account.factChecks({
            chat: String(body.chat),
            ids: body.ids,
          }),
        ]
      : BAD,
};
