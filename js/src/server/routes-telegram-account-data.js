// Change phone number and "Export Telegram data" (R-Y212): the routes of
// the POSTS table in routes-telegram.js, each validated strictly before the
// account is asked. The export only reads from Telegram (through a takeout
// session); its files are written on this computer, in a folder the server
// chooses under the store directory's `exports`.
//
// Its routes:
//   POST /api/telegram/phone-change-send {phone} -> { ok, phoneCodeHash,
//                       length, timeout } the code goes to the new number;
//                       or { ok: false, code } (occupied, phone-invalid,
//                       banned, flood, send-failed, fresh)
//   POST /api/telegram/phone-change-confirm {phone, phoneCodeHash, code}
//                       -> { ok, phone }; or { ok: false, code }
//                       (code-invalid, code-expired, occupied, flood, …)
//   POST /api/telegram/data-export-start {info?, contacts?, kinds:
//                       {personal, bots, privateGroups, privateChannels,
//                       publicChats: boolean}, media?, sizeLimitMb (1..4000,
//                       default 8), from?, to? (YYYY-MM-DD), formats:
//                       ['html'|'json']} -> { ok, job }; or { ok: false,
//                       code: 'takeout-delay', seconds } when Telegram will
//                       allow the export later (TAKEOUT_INIT_DELAY_X),
//                       bad-request, busy
//   POST /api/telegram/data-export-status -> { ok, job } phase, chats done
//                       / total, messages, files, state
//   POST /api/telegram/data-export-cancel -> { ok, job } stops it; what was
//                       written stays
//   POST /api/telegram/data-export-reveal -> { ok } opens the finished
//                       export's folder in the file manager

import { CODE, PHONE } from '../sources/telegram-phone-change.js';
import { parseDataExport } from '../sources/telegram-account-data.js';

import { bad, plain } from './routes-telegram-export.js';

export const ACCOUNT_DATA_POSTS = {
  'phone-change-send': async (account, body) =>
    PHONE.test(String(body.phone ?? '')) &&
    typeof account.phoneChangeSend === 'function'
      ? [200, await account.phoneChangeSend({ phone: String(body.phone) })]
      : bad('phone required'),
  'phone-change-confirm': async (account, body) =>
    PHONE.test(String(body.phone ?? '')) &&
    CODE.test(String(body.code ?? '')) &&
    /^[\w-]{1,128}$/.test(String(body.phoneCodeHash ?? '')) &&
    typeof account.phoneChangeConfirm === 'function'
      ? [
          200,
          await account.phoneChangeConfirm({
            phone: String(body.phone),
            code: String(body.code),
            phoneCodeHash: String(body.phoneCodeHash),
          }),
        ]
      : bad('phone, code and hash required'),
  'data-export-start': async (account, body) =>
    parseDataExport(body).ok && typeof account.dataExportStart === 'function'
      ? [200, await account.dataExportStart(body)]
      : bad('kinds and formats required'),
  'data-export-status': plain('dataExportStatus'),
  'data-export-cancel': plain('dataExportCancel'),
  'data-export-reveal': plain('dataExportReveal'),
};
