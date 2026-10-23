// Hashtag and cashtag search, and the live counters under channel posts
// (R-Y182; learned, never copied): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/search-tag {tag, scope, chat?, cursor?} -> { ok,
//                       messages, count, more, cursor } the messages that
//                       hold #tag or $TAG: scope `chat` in one chat (chat
//                       required; messages.search), `all` in every chat
//                       (messages.searchGlobal) or `public` in public posts
//                       (channels.searchPosts); `cursor` asks for the page
//                       after the last one
//   POST /api/telegram/message-views {chat, ids, increment?} -> { ok,
//                       items: [{ id, views?, forwards?, replies? }] } the
//                       counters of up to 100 posts (messages.getMessagesViews);
//                       `increment: true` counts the posts as seen

import { TAG } from '../sources/telegram-global.js';
import { validViewsRequest } from '../sources/telegram-views.js';

export const TAG_SCOPES = ['chat', 'all', 'public'];
const CHAT = /^-?\d{1,20}$/;
const CURSOR = /^[A-Za-z0-9:_-]{1,64}$/;

/** Whether a body is a hashtag search the account is asked. */
export const validTagSearch = (body = {}) =>
  TAG.test(String(body.tag ?? '')) &&
  TAG_SCOPES.includes(body.scope) &&
  (body.scope !== 'chat' || CHAT.test(String(body.chat ?? ''))) &&
  (body.cursor === undefined ||
    body.cursor === null ||
    (typeof body.cursor === 'string' && CURSOR.test(body.cursor)));

const searchTag = (account, body) =>
  body.scope === 'chat'
    ? account.searchChat({
        chat: body.chat,
        q: body.tag,
        offsetId: Number(body.cursor) || 0,
        links: true,
      })
    : account.searchTag({
        tag: body.tag,
        scope: body.scope,
        cursor: body.cursor ?? null,
      });

export const HASHTAG_POSTS = {
  'search-tag': async (account, body) =>
    validTagSearch(body) &&
    typeof account.searchChat === 'function' &&
    typeof account.searchTag === 'function'
      ? [200, await searchTag(account, body)]
      : [400, { error: 'tag and scope required', code: 'bad-request' }],
  'message-views': async (account, body) =>
    validViewsRequest(body) && typeof account.messageViews === 'function'
      ? [
          200,
          await account.messageViews({
            chat: body.chat,
            ids: body.ids,
            increment: body.increment === true,
          }),
        ]
      : [400, { error: 'chat and ids required', code: 'bad-request' }],
};
