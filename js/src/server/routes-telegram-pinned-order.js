// Reordering the pinned chats (R-Y159): the route of the POSTS table in
// routes-telegram.js, validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/pinned-reorder {folder, chats} -> { ok, folder,
//                       chats } folder 0 (main list) or 1 (Archive); chats
//                       the pinned chats' ids, top first: 1 to 100, each a
//                       chat id, no duplicates

import { validOrder } from '../sources/telegram-pinned-order.js';

export const PINNED_ORDER_POSTS = {
  'pinned-reorder': async (account, body) =>
    (body.folder === 0 || body.folder === 1) &&
    validOrder(body.chats) &&
    typeof account.reorderPinned === 'function'
      ? [
          200,
          await account.reorderPinned({
            folder: body.folder,
            chats: body.chats,
          }),
        ]
      : [400, { error: 'folder and chats required', code: 'bad-request' }],
};
