// Managing received gifts, unique gifts and gift codes (R-Y193): the routes
// of the POSTS table in routes-telegram.js, each validated strictly before
// the account is asked. A gift is named by `chat` and either `msgId` (a
// person's gift) or `savedId` (a chat's gift), called `ref` below.
//
// Its routes:
//   POST /api/telegram/gift-convert {ref} -> { ok } turns a gift into Stars
//                       (a write, on the confirmation only)
//   POST /api/telegram/gift-upgrade-preview {giftId} -> { ok, models,
//                       patterns, backdrops, prices } what an upgrade may
//                       become (changes nothing)
//   POST /api/telegram/gift-upgrade {ref, stars, keepDetails?} -> { ok,
//                       paid } makes the gift unique; `stars` is the price
//                       shown (0 = free); refused with code 'price' when
//                       the payment form's price differs
//   POST /api/telegram/gift-transfer {ref, to, stars} -> { ok, paid } gives
//                       a unique gift to the person `to`; same price rule
//   POST /api/telegram/gift-pin {chat, pins: [ref]} -> { ok, pinned, limit }
//                       sets the gifts pinned to the top of a profile; more
//                       than the limit is code 'pin-limit'
//   POST /api/telegram/gift-unique {slug} -> { ok, gift } a unique gift
//                       (model, backdrop, pattern, number, owner)
//   POST /api/telegram/gift-code-check {slug} -> { ok, info } what a gift
//                       code holds (months, from, date, used); changes
//                       nothing
//   POST /api/telegram/gift-code-apply {slug} -> { ok } activates the code
//                       (a write, on the confirmation only)

import { refOf, validRef } from '../sources/telegram-gifts-manage.js';

const SLUG = /^[A-Za-z0-9_-]{1,100}$/;
const USER = /^\d{1,20}$/;
const bad = (error) => [400, { error, code: 'bad-request' }];
const price = (n) => Number.isInteger(n) && n >= 0;

const call = (method, valid, pass, error) => async (account, body) =>
  valid(body) && typeof account[method] === 'function'
    ? [200, await account[method](pass(body))]
    : bad(error);

const withRef = (extra) => (b) => ({ ...refOf(b), ...extra(b) });

export const GIFTS_MANAGE_POSTS = {
  'gift-convert': call(
    'giftConvert',
    validRef,
    refOf,
    'a person and one gift required'
  ),
  'gift-upgrade-preview': call(
    'giftUpgradePreview',
    (b) => USER.test(String(b.giftId ?? '')),
    (b) => ({ giftId: String(b.giftId) }),
    'a gift required'
  ),
  'gift-upgrade': call(
    'giftUpgrade',
    (b) =>
      validRef(b) &&
      price(b.stars) &&
      (b.keepDetails === undefined || typeof b.keepDetails === 'boolean'),
    withRef((b) => ({
      stars: b.stars,
      ...(b.keepDetails === true ? { keepDetails: true } : {}),
    })),
    'a gift and the price shown required'
  ),
  'gift-transfer': call(
    'giftTransfer',
    (b) => validRef(b) && price(b.stars) && USER.test(String(b.to ?? '')),
    withRef((b) => ({ to: String(b.to), stars: b.stars })),
    'a gift, a person and the price shown required'
  ),
  'gift-pin': call(
    'giftPin',
    (b) =>
      /^-?\d{1,20}$/.test(String(b.chat ?? '')) &&
      Array.isArray(b.pins) &&
      b.pins.length <= 100 &&
      b.pins.every((one) => validRef({ ...one, chat: b.chat })),
    (b) => ({
      chat: String(b.chat),
      pins: b.pins.map((one) =>
        one.msgId === undefined
          ? { savedId: String(one.savedId) }
          : { msgId: one.msgId }
      ),
    }),
    'a chat and its pinned gifts required'
  ),
  'gift-unique': call(
    'giftUnique',
    (b) => typeof b.slug === 'string' && SLUG.test(b.slug),
    (b) => ({ slug: String(b.slug) }),
    'a gift link required'
  ),
  'gift-code-check': call(
    'giftCodeCheck',
    (b) => typeof b.slug === 'string' && SLUG.test(b.slug),
    (b) => ({ slug: String(b.slug) }),
    'a gift code required'
  ),
  'gift-code-apply': call(
    'giftCodeApply',
    (b) => typeof b.slug === 'string' && SLUG.test(b.slug),
    (b) => ({ slug: String(b.slug) }),
    'a gift code required'
  ),
};
