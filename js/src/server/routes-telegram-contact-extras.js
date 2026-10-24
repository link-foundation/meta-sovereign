// Contact notes, share-my-contact links, phone links, photos for contacts,
// suggested birthdays, synced contacts and blocking from Replies (R-Y217):
// the routes of the POSTS table in routes-telegram.js, each validated
// strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/contact-note {chat, note} -> { ok, note } the private
//                       note on a contact (at most 128 characters, "" clears)
//   POST /api/telegram/contact-token {} -> { ok, url, expires } the link
//                       t.me/contact/<token> to share the user's contact
//   POST /api/telegram/contact-token-open {token} -> { ok, chat, name } the
//                       person that link names
//   POST /api/telegram/phone-resolve {phone} -> { ok, found, chat?, name? }
//                       the person with that number (t.me/+<digits>)
//   POST /api/telegram/contact-photo {chat, mode, token?} -> { ok, mode }
//                       mode save (only the user sees it), suggest, or reset
//                       (the personal photo removed; no token)
//   POST /api/telegram/birthday-suggest {chat, day, month, year?} -> { ok }
//   POST /api/telegram/saved-contacts {} -> { ok, count } the imported
//                       contacts Telegram keeps
//   POST /api/telegram/saved-contacts-reset {} -> { ok } those deleted
//   POST /api/telegram/block-from-replies {msgId, deleteMessage?,
//                       deleteHistory?, reportSpam?} -> { ok } the sender
//                       of a message of the Replies chat blocked

import { route } from './routes-telegram-admin-extras.js';
import {
  MODES,
  NOTE_MAX,
  PHONE_DIGITS,
  TOKEN,
  USER,
  validMsgId,
} from '../sources/telegram-contact-extras.js';

const UPLOAD = /^[a-f0-9]{32}$/;
const user = (b) => USER.test(String(b.chat ?? ''));
const flag = (v) => v === undefined || typeof v === 'boolean';
const always = () => true;

export const CONTACT_EXTRAS_POSTS = {
  'contact-note': route(
    'contactNote',
    'chat and note required',
    (b) => user(b) && typeof b.note === 'string' && b.note.length <= NOTE_MAX,
    (b) => ({ chat: String(b.chat), note: b.note })
  ),
  'contact-token': route('contactToken', 'unsupported', always, () => ({})),
  'contact-token-open': route(
    'contactTokenOpen',
    'token required',
    (b) => typeof b.token === 'string' && TOKEN.test(b.token),
    (b) => ({ token: b.token })
  ),
  'phone-resolve': route(
    'phoneResolve',
    'phone required',
    (b) =>
      typeof b.phone === 'string' &&
      PHONE_DIGITS.test(b.phone.replace(/^\+/, '')),
    (b) => ({ phone: b.phone })
  ),
  'contact-photo': route(
    'contactPhoto',
    'chat, mode and token required',
    (b) =>
      user(b) &&
      MODES.includes(b.mode) &&
      (b.mode === 'reset'
        ? b.token === undefined
        : typeof b.token === 'string' && UPLOAD.test(b.token)),
    (b) => ({ chat: String(b.chat), mode: b.mode, token: b.token })
  ),
  'birthday-suggest': route(
    'birthdaySuggest',
    'chat, day and month required',
    (b) => user(b) && Number.isInteger(b.day) && Number.isInteger(b.month),
    ({ chat, day, month, year }) => ({ chat: String(chat), day, month, year })
  ),
  'saved-contacts': route('savedContacts', 'unsupported', always, () => ({})),
  'saved-contacts-reset': route(
    'savedContactsReset',
    'unsupported',
    always,
    () => ({})
  ),
  'block-from-replies': route(
    'blockFromReplies',
    'msgId required',
    (b) =>
      validMsgId(b.msgId) &&
      flag(b.deleteMessage) &&
      flag(b.deleteHistory) &&
      flag(b.reportSpam),
    ({ msgId, deleteMessage, deleteHistory, reportSpam }) => ({
      msgId,
      deleteMessage,
      deleteHistory,
      reportSpam,
    })
  ),
};
