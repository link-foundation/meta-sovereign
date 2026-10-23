// Which reactions a group or channel allows (R-Y160): the routes of the
// POSTS table in routes-telegram.js, each validated strictly before the
// account is asked.
//
// Its routes:
//   POST /api/telegram/available-reactions {} -> { ok, reactions } the
//                       emoji reactions Telegram offers, the inactive ones
//                       left out: [{ emoji, title, premium }]
//   POST /api/telegram/chat-reactions-set {chat, mode, reactions?} -> { ok }
//                       a group's or channel's allowed reactions: mode all,
//                       some (1 to 100 distinct emoji of at most 16
//                       characters in `reactions`) or none

import { validSetting } from '../sources/telegram-chat-reactions.js';

export const CHAT_REACTIONS_POSTS = {
  'available-reactions': async (account) =>
    typeof account.availableReactions === 'function'
      ? [200, await account.availableReactions()]
      : [400, { error: 'not supported', code: 'bad-request' }],
  'chat-reactions-set': async (account, body) =>
    validSetting(body) && typeof account.chatReactionsSet === 'function'
      ? [
          200,
          await account.chatReactionsSet({
            chat: body.chat,
            mode: body.mode,
            ...(body.mode === 'some' ? { reactions: body.reactions } : {}),
          }),
        ]
      : [400, { error: 'chat and mode required', code: 'bad-request' }],
};
