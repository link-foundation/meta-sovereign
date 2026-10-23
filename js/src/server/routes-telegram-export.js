// Exporting a chat's history to a folder (R-Y186): the routes of the POSTS
// table in routes-telegram.js, each validated strictly before the account
// is asked. Only reads go to Telegram; the files are written on this
// computer. The progress follows as `export:telegram:<chat>` links on the
// events stream.
//
// Its routes:
//   POST /api/telegram/export-defaults -> { ok, folder, job } Desktop's
//                       default folder (~/Downloads/Telegram Desktop/
//                       ChatExport_<YYYY-MM-DD>) and the running or last
//                       export (job, or null)
//   POST /api/telegram/export-start {chat, chatName?, media: {photos,
//                       videos, voice, roundVideo, stickers, gifs, files:
//                       boolean}, sizeLimitMb (1..4000, default 8), from?,
//                       to? (YYYY-MM-DD), formats: ['html'|'json'], folder}
//                       -> { ok, job }; or { ok: false, code } with
//                       bad-request, relative-folder, inside-store,
//                       bad-folder, busy (one at a time), no-access
//   POST /api/telegram/export-status -> { ok, job } messages done / total,
//                       files, skipped, bytes, current file, state
//   POST /api/telegram/export-cancel -> { ok, job } stops it; what was
//                       written stays
//   POST /api/telegram/export-reveal -> { ok } opens the finished export's
//                       folder in the file manager

import { parseExport } from '../sources/telegram-export.js';

const bad = (error) => [400, { error, code: 'bad-request' }];

const plain = (method) => async (account) =>
  typeof account[method] === 'function'
    ? [200, await account[method]()]
    : bad('not supported');

export const EXPORT_POSTS = {
  'export-defaults': plain('exportDefaults'),
  'export-start': async (account, body) =>
    parseExport(body).ok &&
    typeof body.folder === 'string' &&
    typeof account.exportStart === 'function'
      ? [200, await account.exportStart(body)]
      : bad('chat, kinds, formats and a folder required'),
  'export-status': plain('exportStatus'),
  'export-cancel': plain('exportCancel'),
  'export-reveal': plain('exportReveal'),
};
