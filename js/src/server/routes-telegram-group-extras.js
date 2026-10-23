// A group's sticker set, pinned topics' order, new chats in a shared
// folder and the new-contacts notification (R-Y211): the routes of the
// POSTS table in routes-telegram.js, each validated strictly before the
// account is asked.
//
// Its routes:
//   POST /api/telegram/group-sticker-set {chat, shortName|null, emojis?}
//                       -> { ok } the supergroup's sticker set (or, with
//                       emojis, its emoji pack) set by short name, or taken
//                       off with null (R-Y211)
//   POST /api/telegram/topic-reorder {chat, order} -> { ok } the forum's
//                       pinned topics in a new order, up to 100 topic ids
//                       (never General) (R-Y211)
//   POST /api/telegram/chatlist-updates {id} -> { ok, chats: [{ chat, name,
//                       kind }] } the chats added to a shared folder the
//                       user joined (R-Y211)
//   POST /api/telegram/chatlist-updates-join {id, chats} -> { ok } only on
//                       the user's press: the chosen new chats joined
//   POST /api/telegram/chatlist-updates-hide {id} -> { ok } the notice put
//                       away
//   POST /api/telegram/contact-signup {} -> { ok, on } whether the account
//                       is told when a contact joins Telegram
//   POST /api/telegram/contact-signup-set {on} -> { ok, on }

import { validChats, validFolderId } from '../sources/telegram-chatlists.js';
import { validGroupSet, CHANNEL } from '../sources/telegram-group-extras.js';
import { pinOrderOf } from '../sources/telegram-topic-admin.js';
import { route } from './routes-telegram-admin-extras.js';

const ofFolder = (b) => ({ id: b.id });

export const GROUP_EXTRAS_POSTS = {
  'group-sticker-set': route(
    'groupStickerSet',
    'chat and a short name (or null) required',
    (b) => b.shortName !== undefined && validGroupSet(b),
    (b) => ({ chat: b.chat, shortName: b.shortName, emojis: b.emojis === true })
  ),
  'topic-reorder': route(
    'reorderTopics',
    'chat and order required',
    (b) => CHANNEL.test(String(b.chat ?? '')) && Boolean(pinOrderOf(b.order)),
    (b) => ({ chat: b.chat, order: b.order })
  ),
  'chatlist-updates': route(
    'chatlistUpdates',
    'id required',
    (b) => validFolderId(b.id),
    ofFolder
  ),
  'chatlist-updates-join': route(
    'chatlistUpdatesJoin',
    'id and chats required',
    (b) => validFolderId(b.id) && validChats(b.chats, { min: 1 }),
    (b) => ({ id: b.id, chats: b.chats })
  ),
  'chatlist-updates-hide': route(
    'chatlistUpdatesHide',
    'id required',
    (b) => validFolderId(b.id),
    ofFolder
  ),
  'contact-signup': route(
    'contactSignUpGet',
    'not supported',
    () => true,
    () => ({})
  ),
  'contact-signup-set': route(
    'contactSignUpSet',
    'on required',
    (b) => typeof b.on === 'boolean',
    (b) => ({ on: b.on })
  ),
};
