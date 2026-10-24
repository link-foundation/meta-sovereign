// The emoji panel's Premium flag and category groups (R-Y214): the route
// of the POSTS table in routes-telegram.js, validated before the account
// is asked.
//
// Its routes:
//   POST /api/telegram/emoji-panel-info {status?} -> { ok, premium, groups:
//                       [{ title, iconEmojiId, emoticons }] } whether the
//                       account has Premium and Telegram's emoji groups
//                       (status: true, the emoji status picker's)

import { route } from './routes-telegram-admin-extras.js';

export const EMOJI_GROUPS_POSTS = {
  'emoji-panel-info': route(
    'emojiPanelInfo',
    'status must be true or false',
    (b) => b.status === undefined || typeof b.status === 'boolean',
    (b) => ({ status: b.status === true })
  ),
};
