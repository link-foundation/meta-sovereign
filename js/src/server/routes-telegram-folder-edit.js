// Creating, editing, deleting and ordering chat folders (R-Y164): the
// routes of the POSTS table in routes-telegram.js, each validated
// strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/folder-save {id?, folder} -> { ok, id } a folder
//                       (title up to 12 letters, the kinds it takes, the
//                       chats it includes and excludes) made or changed
//   POST /api/telegram/folder-delete {id} -> { ok }
//   POST /api/telegram/folders-reorder {order} -> { ok } every folder id
//                       in the new order (0 is "All chats")
//   POST /api/telegram/folders-suggested {} -> { ok, suggested } the
//                       recommended folders, `{ folder, description }`

import { validFolder, validId } from '../sources/telegram-folder-edit.js';

const bad = (error) => [400, { error, code: 'bad-request' }];
const answer = async (account, name, args) =>
  typeof account[name] === 'function'
    ? [200, await account[name](args)]
    : bad('not supported');

export const FOLDER_EDIT_POSTS = {
  'folder-save': async (account, body) =>
    validFolder(body.folder) && (body.id === undefined || validId(body.id))
      ? answer(account, 'folderSave', { id: body.id, folder: body.folder })
      : bad('folder required'),
  'folder-delete': async (account, body) =>
    validId(body.id)
      ? answer(account, 'folderDelete', { id: body.id })
      : bad('id required'),
  'folders-reorder': async (account, body) =>
    Array.isArray(body.order) &&
    body.order.length > 0 &&
    body.order.every((n) => n === 0 || validId(n))
      ? answer(account, 'foldersReorder', { order: body.order })
      : bad('order required'),
  'folders-suggested': async (account) =>
    answer(account, 'foldersSuggested', {}),
};
