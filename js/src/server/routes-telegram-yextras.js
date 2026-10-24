// The route tables of the R-Y213..R-Y216 features in one spread, so that
// routes-telegram.js stays under its line limit. Each table documents its
// own routes in its file's header:
//   routes-telegram-translate-chat.js (R-Y213), -emoji-groups.js (R-Y214),
//   -storage.js (R-Y215), -channel-manage.js (R-Y216).

import { TRANSLATE_CHAT_POSTS } from './routes-telegram-translate-chat.js';
import { EMOJI_GROUPS_POSTS } from './routes-telegram-emoji-groups.js';
import { STORAGE_POSTS } from './routes-telegram-storage.js';
import { CHANNEL_MANAGE_POSTS } from './routes-telegram-channel-manage.js';

export const YEXTRAS_POSTS = {
  ...TRANSLATE_CHAT_POSTS,
  ...EMOJI_GROUPS_POSTS,
  ...STORAGE_POSTS,
  ...CHANNEL_MANAGE_POSTS,
};
