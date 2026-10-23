/**
 * Sending a gift to a person, as Telegram Desktop's "Send a gift" does
 * (R-Y185; learned, never copied):
 * - `giftCatalogue({ fresh? })` — the gifts one can buy
 *   (payments.getStarGifts, asked with the hash of the last answer, so an
 *   unchanged catalogue is not sent again) → `{ ok, gifts: [{ id, stars,
 *   title, limited, soldOut, remains, total, premium, birthday, sticker }] }`;
 *   each `sticker` is the sticker panel's item (see telegram-stickers.js);
 * - `giftSend({ chat, gift, stars, text?, hideName? })` — the only thing
 *   that pays, on the confirmation's button alone: payments.checkCanSendGift
 *   first (the person may not take gifts), then payments.getPaymentForm
 *   with an InputInvoiceStarGift, then payments.sendStarsForm with that
 *   form's id — and only when the form's price is the `stars` the page
 *   showed (else `code: 'price'`, nothing is paid).
 * Telegram's errors become codes the page shows as text.
 */

import { formPrice } from './telegram-stars.js';
import { connected, failureOf, panelItem, runIn } from './telegram-stickers.js';

/** The longest message with a gift Telegram's usual limit allows. */
export const TEXT_MAX = 255;

const CODES = {
  BALANCE_TOO_LOW: 'balance',
  STARS_BALANCE_TOO_LOW: 'balance',
  PAYMENT_FAILED: 'balance',
  STARGIFT_USAGE_LIMITED: 'sold-out',
  STARGIFT_INVALID: 'no-gift',
  STARGIFT_NOT_FOUND: 'no-gift',
  INVOICE_INVALID: 'no-gift',
  USER_PRIVACY_RESTRICTED: 'privacy',
  PEER_ID_INVALID: 'no-chat',
  USER_ID_INVALID: 'no-chat',
  FORM_ID_EXPIRED: 'expired',
  MESSAGE_TOO_LONG: 'too-long',
  FLOOD_WAIT: 'flood',
};
const failure = failureOf(CODES);
const BAD = { ok: false, error: 'bad request', code: 'failed' };
const USER = /^\d{1,20}$/;
const GIFT = /^\d{1,20}$/;

const text = (value) => String(value?.value ?? value ?? '');
const whole = (n) => Number(n ?? 0) || 0;

/** A catalogue gift as the page's card. */
export const giftCard = (gift, remember) => ({
  id: text(gift.id),
  stars: whole(gift.stars),
  title: String(gift.title ?? ''),
  limited: Boolean(gift.limited),
  soldOut: Boolean(gift.soldOut),
  remains: gift.limited ? whole(gift.availabilityRemains) : null,
  total: gift.limited ? whole(gift.availabilityTotal) : null,
  premium: Boolean(gift.requirePremium),
  birthday: Boolean(gift.birthday),
  sticker:
    gift.sticker?.className === 'Document' ? remember(gift.sticker) : null,
});

const valid = (request) =>
  USER.test(String(request?.chat ?? '')) &&
  GIFT.test(String(request?.gift ?? '')) &&
  Number.isInteger(request?.stars) &&
  request.stars >= 1 &&
  (request.text === undefined ||
    (typeof request.text === 'string' && request.text.length <= TEXT_MAX)) &&
  (request.hideName === undefined || typeof request.hideName === 'boolean');

export const createGiftSend = (env, { userClient, stickers }) => {
  let held = null; // { hash, gifts } of the last catalogue answer
  const doing = (key, use) =>
    connected(env, userClient, failure, (c) => runIn(env, key, () => use(c)));
  const remember = (doc) =>
    stickers?.remember
      ? stickers.remember([doc], 'gift:catalogue', 'sticker')[0]
      : panelItem(doc);

  const giftCatalogue = async ({ fresh = false } = {}) =>
    doing('gift-send:catalogue', async (c) => {
      const hash = held && !fresh ? held.hash : 0;
      const answer = await c.client.invoke(
        new c.Api.payments.GetStarGifts({ hash })
      );
      if (answer?.className === 'payments.StarGiftsNotModified' && held) {
        return { ok: true, gifts: held.gifts };
      }
      const gifts = (answer?.gifts ?? [])
        .filter((g) => g?.className === 'StarGift' && !g.auction)
        .map((g) => giftCard(g, remember));
      held = { hash: whole(answer?.hash), gifts };
      return { ok: true, gifts };
    });

  // A gift's sticker file reference expired: the catalogue, again.
  stickers?.onAgain?.('gift:catalogue', () => giftCatalogue({ fresh: true }));

  // Whether this person takes gifts: a reason in words, or null.
  const refusal = async (c, gift) => {
    if (!c.Api.payments.CheckCanSendGift) {
      return null;
    }
    const result = await c.client.invoke(
      new c.Api.payments.CheckCanSendGift({
        giftId: c.helpers.returnBigInt(gift),
      })
    );
    return result?.className === 'payments.CheckCanSendGiftResultFail'
      ? String(result.reason?.text ?? '')
      : null;
  };

  const pay = async (c, peer, request) => {
    const why = await refusal(c, String(request.gift));
    if (why !== null) {
      return { ok: false, error: why || 'cannot send', code: 'cannot' };
    }
    const invoice = new c.Api.InputInvoiceStarGift({
      peer,
      giftId: c.helpers.returnBigInt(String(request.gift)),
      ...(request.hideName ? { hideName: true } : {}),
      ...(request.text
        ? {
            message: new c.Api.TextWithEntities({
              text: request.text,
              entities: [],
            }),
          }
        : {}),
    });
    const form = await c.client.invoke(
      new c.Api.payments.GetPaymentForm({ invoice })
    );
    if (formPrice(form) !== request.stars) {
      return { ok: false, error: 'price changed', code: 'price' };
    }
    const result = await c.client.invoke(
      new c.Api.payments.SendStarsForm({ formId: form.formId, invoice })
    );
    return result?.className === 'payments.PaymentVerificationNeeded'
      ? { ok: false, error: 'verification needed', code: 'verify' }
      : { ok: true, paid: request.stars };
  };

  const giftSend = async (request = {}) =>
    !valid(request)
      ? BAD
      : doing(`gift-send:${request.chat}`, (c) =>
          env.connection.withPeer(c.client, String(request.chat), (peer) =>
            pay(c, peer, request)
          )
        );

  return { giftCatalogue, giftSend };
};
