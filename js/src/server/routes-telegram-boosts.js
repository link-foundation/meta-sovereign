// Channel boosts (R-Y173): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/boosts-status {chat} -> { ok, level, boosts,
//                       giftBoosts, currentLevelBoosts, nextLevelBoosts,
//                       url, mine } a channel's or supergroup's boost level
//   POST /api/telegram/my-boosts {chat} -> { ok, premium, slots: [{ slot,
//                       chat, title, expires, cooldownUntil }] } the user's
//                       boost slots
//   POST /api/telegram/boost-apply {chat, slot} -> { ok, slots } gives the
//                       chat that slot's boost (a write, on a click only)
//   POST /api/telegram/boosters {chat, offset?} -> { ok, count, boosters,
//                       next } who boosts it (admins), a page at a time

const CHANNEL = /^-100\d{1,20}$/;
const bad = [
  400,
  { error: 'a channel or supergroup required', code: 'bad-request' },
];

const route =
  (method, valid = () => true) =>
  async (account, body) =>
    CHANNEL.test(String(body.chat ?? '')) &&
    valid(body) &&
    typeof account[method] === 'function'
      ? [200, await account[method]({ ...body, chat: String(body.chat) })]
      : bad;

export const BOOSTS_POSTS = {
  'boosts-status': route('boostsStatus'),
  'my-boosts': route('myBoosts'),
  'boost-apply': route(
    'boostApply',
    (body) => Number.isInteger(body.slot) && body.slot > 0
  ),
  boosters: route(
    'boostersList',
    (body) =>
      body.offset === undefined ||
      (typeof body.offset === 'string' && body.offset.length <= 200)
  ),
};
