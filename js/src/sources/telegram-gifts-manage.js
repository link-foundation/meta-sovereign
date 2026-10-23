/**
 * Managing received gifts, unique (collectible) gifts and gift codes, as
 * Telegram Desktop does (R-Y193; learned, never copied). The list of a
 * person's gifts is `starGifts` (telegram-stars.js); this adds what is done
 * to one. A gift is named by `chat` and either `msgId` (a gift of a person,
 * InputSavedStarGiftUser) or `savedId` (a gift of a chat,
 * InputSavedStarGiftChat). Every write happens on its own click, behind the
 * page's confirmation:
 * - `giftConvert(ref)` — payments.convertStarGift → `{ ok }`;
 * - `giftUpgradePreview({ giftId })` — payments.getStarGiftUpgradePreview →
 *   `{ ok, models, patterns, backdrops, prices }` (what an upgrade may
 *   become; nothing is changed);
 * - `giftUpgrade({ ...ref, stars, keepDetails? })` — free (`stars` 0:
 *   payments.upgradeStarGift) or paid (a payment form with
 *   InputInvoiceStarGiftUpgrade, sent only when its price is the `stars`
 *   the page showed, else `code: 'price'`, nothing is paid);
 * - `giftTransfer({ ...ref, to, stars })` — the same for a unique gift
 *   given to the person `to` (payments.transferStarGift or an
 *   InputInvoiceStarGiftTransfer form);
 * - `giftPin({ chat, pins })` — payments.toggleStarGiftsPinnedToTop sets the
 *   pinned list (the app config's `stargifts_pinned_to_top_limit`, else 6;
 *   more is refused with `code: 'pin-limit'` and the `limit`);
 * - `giftUnique({ slug })` — payments.getUniqueStarGift → `{ ok, gift }`;
 * - `giftCodeCheck({ slug })` — payments.checkGiftCode → `{ ok, info }`;
 * - `giftCodeApply({ slug })` — payments.applyGiftCode (Premium, for the
 *   months the code holds).
 * Telegram's errors become codes the page shows as text.
 */

import { entitiesOf, formPrice, nameOf, peerEntity } from './telegram-stars.js';
import { connected, failureOf, runIn } from './telegram-stickers.js';

/** Telegram's default of gifts pinned to the top of a profile. */
export const PIN_LIMIT = 6;
const PIN_KEY = 'stargifts_pinned_to_top_limit';
const LISTED = 12; // the most of each kind of attribute a preview lists

const CODES = {
  STARGIFT_ALREADY_UPGRADED: 'already',
  STARGIFT_ALREADY_CONVERTED: 'already',
  STARGIFT_CONVERT_TOO_OLD: 'too-old',
  STARGIFT_UPGRADE_UNAVAILABLE: 'cannot-upgrade',
  STARGIFT_TRANSFER_TOO_EARLY: 'too-early',
  STARGIFT_NOT_UNIQUE: 'cannot-transfer',
  STARGIFT_OWNER_INVALID: 'cannot-transfer',
  STARGIFT_SLUG_INVALID: 'no-gift',
  STARGIFT_NOT_FOUND: 'no-gift',
  SAVED_ID_EMPTY: 'no-gift',
  PINNED_TO_TOP_LIMIT: 'pin-limit',
  PAYMENT_REQUIRED: 'price',
  BALANCE_TOO_LOW: 'balance',
  STARS_BALANCE_TOO_LOW: 'balance',
  PAYMENT_FAILED: 'balance',
  USER_PRIVACY_RESTRICTED: 'privacy',
  INVOICE_INVALID: 'no-gift',
  FORM_ID_EXPIRED: 'expired',
  PEER_ID_INVALID: 'no-chat',
  USER_ID_INVALID: 'no-chat',
  GIFT_SLUG_EXPIRED: 'code-expired',
  GIFT_SLUG_INVALID: 'no-code',
  GIFTCODE_NOT_ALLOWED: 'not-allowed',
  PREMIUM_SUB_ACTIVE_UNTIL: 'premium-active',
  FLOOD_WAIT: 'flood',
};
const failure = failureOf(CODES);
const BAD = { ok: false, error: 'bad request', code: 'failed' };
const CHAT = /^-?\d{1,20}$/;
const USER = /^\d{1,20}$/;
const SLUG = /^[A-Za-z0-9_-]{1,100}$/;
const GIFT = /^\d{1,20}$/;
const PINS_MAX = 100;

const text = (value) => String(value?.value ?? value ?? '');
const whole = (n) => Number(n ?? 0) || 0;

/** Whether `request` names one gift: a person's msgId, or a chat's savedId. */
export const validRef = (request) =>
  CHAT.test(String(request?.chat ?? '')) &&
  (Number.isInteger(request.msgId) && request.msgId >= 1
    ? request.savedId === undefined && USER.test(String(request.chat))
    : request.msgId === undefined && GIFT.test(String(request.savedId ?? '')));

/** The part of a request that names one gift (nothing else is passed on). */
export const refOf = (request) =>
  request.msgId !== undefined
    ? { chat: String(request.chat), msgId: request.msgId }
    : { chat: String(request.chat), savedId: String(request.savedId) };

/** A 24-bit colour as "#rrggbb". */
export const hexColor = (n) =>
  `#${((Number(n) >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`;

const RARITIES = {
  StarGiftAttributeRarityUncommon: 'uncommon',
  StarGiftAttributeRarityRare: 'rare',
  StarGiftAttributeRarityEpic: 'epic',
  StarGiftAttributeRarityLegendary: 'legendary',
};

/** How rare an attribute is: `{ rarity }` (a name) or `{ permille }`. */
export const rarityOf = (rarity) =>
  rarity?.className === 'StarGiftAttributeRarity'
    ? { permille: whole(rarity.permille) }
    : { rarity: RARITIES[rarity?.className] ?? '' };

const kindOf = (attributes, className) =>
  (attributes ?? []).filter((a) => a?.className === className);

/** The pinned-gifts limit an app config gives, else Telegram's usual 6. */
export const pinLimitOf = (config) => {
  const entry = (config?.config?.value ?? []).find((e) => e?.key === PIN_KEY);
  const limit = Number(entry?.value?.value);
  return Number.isInteger(limit) && limit > 0 ? limit : PIN_LIMIT;
};

/** What a code says, as the page's info (`months` from its days). */
export const codeInfoOf = (answer) => {
  const entities = entitiesOf(answer);
  const from = answer?.fromId
    ? {
        id: text(
          answer.fromId.userId ??
            answer.fromId.channelId ??
            answer.fromId.chatId
        ),
        name: nameOf(peerEntity(answer.fromId, entities)),
      }
    : null;
  const days = whole(answer?.days);
  return {
    days,
    months: Math.max(1, Math.round(days / 30)),
    from,
    viaGiveaway: Boolean(answer?.viaGiveaway),
    date: whole(answer?.date),
    used: whole(answer?.usedDate) > 0,
    usedDate: whole(answer?.usedDate) || null,
    to: answer?.toId ? text(answer.toId) : null,
  };
};

// The lookups: a unique gift and a gift code, changing nothing but Apply.
const createLookups = ({ doing, sticker }) => {
  const listed = (attributes, className, one) =>
    kindOf(attributes, className).slice(0, LISTED).map(one);

  const giftUpgradePreview = async ({ giftId } = {}) =>
    !GIFT.test(String(giftId ?? ''))
      ? BAD
      : doing(`gift-manage:preview:${giftId}`, async (c) => {
          const answer = await c.client.invoke(
            new c.Api.payments.GetStarGiftUpgradePreview({
              giftId: c.helpers.returnBigInt(String(giftId)),
            })
          );
          const all = answer?.sampleAttributes ?? [];
          const named = (a) => ({
            name: String(a.name ?? ''),
            ...rarityOf(a.rarity),
          });
          return {
            ok: true,
            models: listed(all, 'StarGiftAttributeModel', (a) => ({
              ...named(a),
              sticker: sticker(a.document),
            })),
            patterns: listed(all, 'StarGiftAttributePattern', (a) => ({
              ...named(a),
              sticker: sticker(a.document),
            })),
            backdrops: listed(all, 'StarGiftAttributeBackdrop', (a) => ({
              ...named(a),
              center: hexColor(a.centerColor),
              edge: hexColor(a.edgeColor),
            })),
            prices: (answer?.prices ?? []).map((p) => ({
              date: whole(p.date),
              stars: whole(p.upgradeStars),
            })),
          };
        });

  const attrCard = (a) =>
    a ? { name: String(a.name ?? ''), ...rarityOf(a.rarity) } : null;

  const uniqueOf = (answer) => {
    const gift = answer?.gift;
    if (gift?.className !== 'StarGiftUnique') {
      return null;
    }
    const entities = entitiesOf(answer);
    const [model] = kindOf(gift.attributes, 'StarGiftAttributeModel');
    const [pattern] = kindOf(gift.attributes, 'StarGiftAttributePattern');
    const [backdrop] = kindOf(gift.attributes, 'StarGiftAttributeBackdrop');
    return {
      slug: String(gift.slug ?? ''),
      title: String(gift.title ?? ''),
      num: whole(gift.num),
      issued: whole(gift.availabilityIssued),
      total: whole(gift.availabilityTotal),
      owner: {
        id: gift.ownerId
          ? text(gift.ownerId.userId ?? gift.ownerId.channelId)
          : null,
        name:
          nameOf(peerEntity(gift.ownerId, entities)) ||
          String(gift.ownerName ?? ''),
      },
      model: model && { ...attrCard(model), sticker: sticker(model.document) },
      pattern: pattern && {
        ...attrCard(pattern),
        sticker: sticker(pattern.document),
      },
      backdrop: backdrop && {
        ...attrCard(backdrop),
        center: hexColor(backdrop.centerColor),
        edge: hexColor(backdrop.edgeColor),
        pattern: hexColor(backdrop.patternColor),
        text: hexColor(backdrop.textColor),
      },
    };
  };

  const giftUnique = async ({ slug } = {}) =>
    !SLUG.test(String(slug ?? ''))
      ? BAD
      : doing(`gift-manage:unique:${slug}`, async (c) => {
          const answer = await c.client.invoke(
            new c.Api.payments.GetUniqueStarGift({ slug: String(slug) })
          );
          const gift = uniqueOf(answer);
          return gift
            ? { ok: true, gift }
            : { ok: false, error: 'no gift', code: 'no-gift' };
        });

  const giftCodeCheck = async ({ slug } = {}) =>
    !SLUG.test(String(slug ?? ''))
      ? BAD
      : doing(`gift-manage:code:${slug}`, async (c) => ({
          ok: true,
          info: {
            slug: String(slug),
            ...codeInfoOf(
              await c.client.invoke(
                new c.Api.payments.CheckGiftCode({ slug: String(slug) })
              )
            ),
          },
        }));

  const giftCodeApply = async ({ slug } = {}) =>
    !SLUG.test(String(slug ?? ''))
      ? BAD
      : doing(`gift-manage:apply:${slug}`, async (c) => {
          await c.client.invoke(
            new c.Api.payments.ApplyGiftCode({ slug: String(slug) })
          );
          return { ok: true };
        });

  return { giftUpgradePreview, giftUnique, giftCodeCheck, giftCodeApply };
};

export const createGiftsManage = (env, { userClient, stickers }) => {
  const doing = (key, use) =>
    connected(env, userClient, failure, (c) => runIn(env, key, () => use(c)));
  const sticker = (doc) =>
    doc?.className === 'Document'
      ? (stickers?.remember?.([doc], 'gift:unique', 'sticker')?.[0] ?? null)
      : null;

  // The Telegram input naming one gift (a chat's needs its peer).
  const withRef = (c, ref, use) =>
    ref.msgId !== undefined
      ? use(new c.Api.InputSavedStarGiftUser({ msgId: ref.msgId }))
      : env.connection.withPeer(c.client, ref.chat, (peer) =>
          use(
            new c.Api.InputSavedStarGiftChat({
              peer,
              savedId: c.helpers.returnBigInt(ref.savedId),
            })
          )
        );
  const onRef = (name, request, use) =>
    !validRef(request)
      ? BAD
      : doing(`gift-manage:${name}:${request.chat}`, (c) =>
          withRef(c, refOf(request), (stargift) => use(c, stargift))
        );

  const giftConvert = async (request = {}) =>
    onRef('convert', request, async (c, stargift) => {
      await c.client.invoke(new c.Api.payments.ConvertStarGift({ stargift }));
      return { ok: true };
    });

  // Free: the call itself. Paid: a form, sent only at the price shown.
  const settle = async (c, { free, invoice, stars }) => {
    if (stars === 0) {
      await c.client.invoke(free());
      return { ok: true, paid: 0 };
    }
    const form = await c.client.invoke(
      new c.Api.payments.GetPaymentForm({ invoice })
    );
    if (formPrice(form) !== stars) {
      return { ok: false, error: 'price changed', code: 'price' };
    }
    const result = await c.client.invoke(
      new c.Api.payments.SendStarsForm({ formId: form.formId, invoice })
    );
    return result?.className === 'payments.PaymentVerificationNeeded'
      ? { ok: false, error: 'verification needed', code: 'verify' }
      : { ok: true, paid: stars };
  };

  const stars = (request) =>
    Number.isInteger(request?.stars) && request.stars >= 0;

  const giftUpgrade = async (request = {}) =>
    !stars(request) ||
    (request.keepDetails !== undefined &&
      typeof request.keepDetails !== 'boolean')
      ? BAD
      : onRef('upgrade', request, (c, stargift) => {
          const keep = request.keepDetails ? { keepOriginalDetails: true } : {};
          return settle(c, {
            stars: request.stars,
            free: () =>
              new c.Api.payments.UpgradeStarGift({ ...keep, stargift }),
            invoice: new c.Api.InputInvoiceStarGiftUpgrade({
              ...keep,
              stargift,
            }),
          });
        });

  const giftTransfer = async (request = {}) =>
    !stars(request) || !USER.test(String(request.to ?? ''))
      ? BAD
      : onRef('transfer', request, (c, stargift) =>
          env.connection.withPeer(c.client, String(request.to), (toId) =>
            settle(c, {
              stars: request.stars,
              free: () =>
                new c.Api.payments.TransferStarGift({ stargift, toId }),
              invoice: new c.Api.InputInvoiceStarGiftTransfer({
                stargift,
                toId,
              }),
            })
          )
        );

  const pinLimit = async (c) => {
    try {
      const config = await c.client.invoke(
        new c.Api.help.GetAppConfig({ hash: 0 })
      );
      return pinLimitOf(config);
    } catch {
      return PIN_LIMIT;
    }
  };

  const giftPin = async ({ chat, pins } = {}) =>
    !CHAT.test(String(chat ?? '')) ||
    !Array.isArray(pins) ||
    pins.length > PINS_MAX ||
    !pins.every((one) => validRef({ ...one, chat }))
      ? BAD
      : doing(`gift-manage:pin:${chat}`, async (c) => {
          const limit = await pinLimit(c);
          if (pins.length > limit) {
            return { ok: false, error: 'pin limit', code: 'pin-limit', limit };
          }
          return env.connection.withPeer(
            c.client,
            String(chat),
            async (peer) => {
              const inputs = [];
              for (const one of pins) {
                await withRef(c, refOf({ ...one, chat }), (input) =>
                  inputs.push(input)
                );
              }
              await c.client.invoke(
                new c.Api.payments.ToggleStarGiftsPinnedToTop({
                  peer,
                  stargift: inputs,
                })
              );
              return { ok: true, pinned: pins.length, limit };
            }
          );
        });

  return {
    giftConvert,
    giftUpgrade,
    giftTransfer,
    giftPin,
    ...createLookups({ doing, sticker }),
  };
};
