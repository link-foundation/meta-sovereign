// Telegram Stars (R-Y176): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/stars-status {} -> { ok, balance } the user's Stars
//   POST /api/telegram/stars-history {filter?, offset?} -> { ok, balance,
//                       transactions, next } the history (filter all, in
//                       or out), a page at a time
//   POST /api/telegram/star-gifts {chat, offset?} -> { ok, count, mine,
//                       gifts, next } a person's gifts on their profile
//   POST /api/telegram/star-gift-save {chat, msgId, unsave} -> { ok,
//                       hidden } hides a gift from the profile or shows it
//                       (a write, on a click only)
//   POST /api/telegram/paid-reaction {chat, id, count} -> { ok, sent }
//                       sends Stars as a paid reaction (a write, on Send)
//   POST /api/telegram/paid-media-unlock {chat, id, stars} -> { ok, paid }
//                       pays for a message's paid media (a write, on the
//                       confirmation only; refused if the price changed)

const CHAT = /^-?\d{1,20}$/;
const USER = /^\d{1,20}$/;
const bad = (error) => [400, { error, code: 'bad-request' }];
const whole = (n, min, max = Infinity) =>
  Number.isInteger(n) && n >= min && n <= max;
const paged = (body) =>
  body.offset === undefined ||
  (typeof body.offset === 'string' && body.offset.length <= 200);

const route = (method, valid, error) => async (account, body) =>
  valid(body) && typeof account[method] === 'function'
    ? [200, await account[method](body)]
    : bad(error);

export const STARS_POSTS = {
  'stars-status': route('starsStatus', () => true, 'bad request'),
  'stars-history': route(
    'starsHistory',
    (b) =>
      (b.filter === undefined || ['all', 'in', 'out'].includes(b.filter)) &&
      paged(b),
    'a filter (all, in, out) and an offset required'
  ),
  'star-gifts': route(
    'starGifts',
    (b) => USER.test(String(b.chat ?? '')) && paged(b),
    'a person required'
  ),
  'star-gift-save': route(
    'starGiftSave',
    (b) =>
      USER.test(String(b.chat ?? '')) &&
      whole(b.msgId, 1) &&
      typeof b.unsave === 'boolean',
    'a person, a gift message and unsave required'
  ),
  'paid-reaction': route(
    'paidReaction',
    (b) =>
      CHAT.test(String(b.chat ?? '')) &&
      whole(b.id, 1) &&
      whole(b.count, 1, 2500),
    'a chat, a message and 1 to 2500 Stars required'
  ),
  'paid-media-unlock': route(
    'paidMediaUnlock',
    (b) =>
      CHAT.test(String(b.chat ?? '')) && whole(b.id, 1) && whole(b.stars, 1),
    'a chat, a message and its price required'
  ),
};
