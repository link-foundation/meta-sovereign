// Settings → Stickers and emoji, close friends and adding a contact by
// phone (R-Y169): the routes of the POSTS table in routes-telegram.js, each
// validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/sticker-sets {emojis?} -> { ok, sets: [{ id, title,
//                       count, format, emoji, official }] } the installed
//                       sticker sets (emojis: true, the custom emoji
//                       sets) in the user's order
//   POST /api/telegram/sticker-sets-reorder {ids, emojis?} -> { ok } the
//                       new order: 1 to 1000 distinct set ids
//   POST /api/telegram/sticker-set-archive {id} -> { ok, id } archived
//   POST /api/telegram/sticker-set-remove {id} -> { ok, id } removed
//   POST /api/telegram/sticker-set-add {id} -> { ok, id } installed (an
//                       archived set brought back)
//   POST /api/telegram/sticker-sets-archived {emojis?, offsetId?, limit?}
//                       -> { ok, count, sets, next } the archived sets, a
//                       page (1 to 100, default 20) at a time
//   POST /api/telegram/close-friends {} -> { ok, contacts: [{ id, name,
//                       username, closeFriend }] }
//   POST /api/telegram/close-friends-set {ids} -> { ok, count } the close
//                       friends saved as exactly these user ids (0 to 1000)
//   POST /api/telegram/contact-import {phone, firstName, lastName?} ->
//                       { ok, found, contact?, chat? } one contact added;
//                       phone "+" and 5 to 20 digits, names up to 64 letters

import { MAX_NAME, PHONE, idsOf } from '../sources/telegram-contacts-edit.js';
import { MAX_PAGE, SET_ID, orderOf } from '../sources/telegram-sticker-sets.js';

const BAD = [400, { error: 'bad request', code: 'bad-request' }];
const OPTIONAL_FLAG = (v) => v === undefined || typeof v === 'boolean';

// A route that calls `account[method](arg(body))` once `valid(body)`.
const route =
  (method, valid, arg = (body) => body) =>
  async (account, body) =>
    typeof account[method] === 'function' && valid(body)
      ? [200, await account[method](arg(body))]
      : BAD;

const oneSet = (body) => SET_ID.test(String(body.id ?? ''));
const idOnly = (body) => ({ id: String(body.id) });

const validName = (value, min) => {
  const length = Array.from(String(value ?? '').trim()).length;
  return (
    typeof (value ?? '') === 'string' && length >= min && length <= MAX_NAME
  );
};

/** Whether a body is a phone (with a +) and names Telegram accepts. */
export const validContact = (body) =>
  PHONE.test(String(body.phone ?? '').replace(/[\s()-]/g, '')) &&
  validName(body.firstName, 1) &&
  validName(body.lastName, 0);

const validArchived = (body) =>
  OPTIONAL_FLAG(body.emojis) &&
  (body.offsetId === undefined || SET_ID.test(String(body.offsetId))) &&
  (body.limit === undefined ||
    (Number.isInteger(body.limit) &&
      body.limit >= 1 &&
      body.limit <= MAX_PAGE));

export const STICKER_SETTINGS_POSTS = {
  'sticker-sets': route(
    'setsList',
    (b) => OPTIONAL_FLAG(b.emojis),
    (b) => ({
      emojis: b.emojis === true,
    })
  ),
  'sticker-sets-reorder': route(
    'setsReorder',
    (b) => OPTIONAL_FLAG(b.emojis) && orderOf(b.ids) !== null,
    (b) => ({ ids: b.ids.map(String), emojis: b.emojis === true })
  ),
  'sticker-set-archive': route('setArchive', oneSet, idOnly),
  'sticker-set-remove': route('setRemove', oneSet, idOnly),
  'sticker-set-add': route('setAdd', oneSet, idOnly),
  'sticker-sets-archived': route('archivedList', validArchived, (b) => ({
    emojis: b.emojis === true,
    ...(b.offsetId === undefined ? {} : { offsetId: String(b.offsetId) }),
    ...(b.limit === undefined ? {} : { limit: b.limit }),
  })),
  'close-friends': route(
    'closeFriends',
    () => true,
    () => ({})
  ),
  'close-friends-set': route(
    'closeFriendsSet',
    (b) => idsOf(b.ids) !== null,
    (b) => ({ ids: b.ids.map(String) })
  ),
  'contact-import': route('contactImport', validContact, (b) => ({
    phone: String(b.phone).replace(/[\s()-]/g, ''),
    firstName: String(b.firstName).trim(),
    lastName: String(b.lastName ?? '').trim(),
  })),
};
