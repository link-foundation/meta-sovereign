// Sending a gift (R-Y185): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/gift-catalogue {fresh?} -> { ok, gifts: [{ id,
//                       stars, title, limited, soldOut, remains, total,
//                       premium, birthday, sticker }] } the gifts one can
//                       buy (Telegram's own list, kept by its hash)
//   POST /api/telegram/gift-send {chat, gift, stars, text?, hideName?}
//                       -> { ok, paid } a gift bought for a person: a
//                       payment, so only the confirmation's button sends
//                       it; refused with code 'price' when the payment
//                       form's price is not the `stars` the page showed

import { TEXT_MAX } from '../sources/telegram-gift-send.js';

const bad = (error) => [400, { error, code: 'bad-request' }];

export const GIFT_SEND_POSTS = {
  'gift-catalogue': async (account, body) =>
    (body.fresh === undefined || typeof body.fresh === 'boolean') &&
    typeof account.giftCatalogue === 'function'
      ? [200, await account.giftCatalogue({ fresh: body.fresh === true })]
      : bad('fresh must be true or false'),
  'gift-send': async (account, body) =>
    /^\d{1,20}$/.test(String(body.chat ?? '')) &&
    /^\d{1,20}$/.test(String(body.gift ?? '')) &&
    Number.isInteger(body.stars) &&
    body.stars >= 1 &&
    (body.text === undefined ||
      (typeof body.text === 'string' && body.text.length <= TEXT_MAX)) &&
    (body.hideName === undefined || typeof body.hideName === 'boolean') &&
    typeof account.giftSend === 'function'
      ? [
          200,
          await account.giftSend({
            chat: String(body.chat),
            gift: String(body.gift),
            stars: body.stars,
            ...(body.text ? { text: body.text } : {}),
            ...(body.hideName === true ? { hideName: true } : {}),
          }),
        ]
      : bad('a person, a gift, its price and a short message required'),
};
