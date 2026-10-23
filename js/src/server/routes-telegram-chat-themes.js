// Chat themes and several usernames (R-Y170): the routes of the POSTS
// table in routes-telegram.js, each validated strictly before the account
// is asked.
//
// Its routes:
//   POST /api/telegram/chat-themes {fresh?} -> { ok, themes: [{ emoticon,
//                       title, light, dark }] } the themes Telegram offers
//                       for chats; light and dark hold { base, accent,
//                       outgoing, messages } colour ints, or null
//   POST /api/telegram/chat-theme-set {chat, emoticon} -> { ok } a theme
//                       of the list ('' for none) for a chat with a person
//   POST /api/telegram/username-toggle {username, active, chat?} -> { ok }
//                       a username activated or deactivated (chat: a
//                       channel the user owns; without it, the user's own)
//   POST /api/telegram/usernames-reorder {order, chat?} -> { ok } the
//                       active usernames in this order (1 to 100, distinct)

import { USER_CHAT } from '../sources/telegram-chat-themes.js';
import { CHANNEL, NAME, validOrder } from '../sources/telegram-usernames.js';

const BAD = [400, { error: 'bad request', code: 'bad-request' }];

const optionalChat = (body) =>
  body.chat === undefined || CHANNEL.test(String(body.chat));

const target = (body) => (body.chat === undefined ? {} : { chat: body.chat });

const call = async (account, method, arg) =>
  typeof account[method] === 'function'
    ? [200, await account[method](arg)]
    : BAD;

export const CHAT_THEME_POSTS = {
  'chat-themes': async (account, body) =>
    body.fresh === undefined || typeof body.fresh === 'boolean'
      ? call(account, 'chatThemes', { fresh: body.fresh === true })
      : BAD,
  'chat-theme-set': async (account, body) =>
    USER_CHAT.test(String(body.chat ?? '')) &&
    typeof body.emoticon === 'string' &&
    body.emoticon.length <= 32
      ? call(account, 'setChatTheme', {
          chat: String(body.chat),
          emoticon: body.emoticon,
        })
      : BAD,
  'username-toggle': async (account, body) =>
    NAME.test(String(body.username ?? '')) &&
    typeof body.active === 'boolean' &&
    optionalChat(body)
      ? call(account, 'toggleUsername', {
          username: body.username,
          active: body.active,
          ...target(body),
        })
      : BAD,
  'usernames-reorder': async (account, body) =>
    validOrder(body.order) && optionalChat(body)
      ? call(account, 'reorderUsernames', {
          order: body.order,
          ...target(body),
        })
      : BAD,
};
