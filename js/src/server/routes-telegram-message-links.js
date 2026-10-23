// Links to messages (R-Y154): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/message-link {chat, id, thread?}
//                                      -> { ok, link } a channel or
//                                         supergroup message's t.me link
//                                         (channels.exportMessageLink, R-Y154)
//   POST /api/telegram/resolve-link {username}
//                                      -> { ok, chat, name, kind } the chat
//                                         a t.me/username/123 link names, or
//                                         code no-chat / not-chat (R-Y154)

import {
  CHANNEL_CHAT,
  LINK_USERNAME,
  validMessageId,
} from '../sources/telegram-message-links.js';

const bad = (error) => [400, { error, code: 'bad-request' }];

export const MESSAGE_LINK_POSTS = {
  'message-link': async (account, body) =>
    typeof body.chat === 'string' &&
    CHANNEL_CHAT.test(body.chat) &&
    validMessageId(body.id) &&
    (body.thread === undefined || typeof body.thread === 'boolean') &&
    typeof account.messageLink === 'function'
      ? [
          200,
          await account.messageLink({
            chat: body.chat,
            id: body.id,
            thread: body.thread === true,
          }),
        ]
      : bad('a channel chat and a message id required'),
  'resolve-link': async (account, body) =>
    typeof body.username === 'string' &&
    LINK_USERNAME.test(body.username) &&
    typeof account.resolveLink === 'function'
      ? [200, await account.resolveLink({ username: body.username })]
      : bad('username required'),
};
