// Pure helpers of managing received gifts, unique gifts and gift codes
// (R-Y193; learned, never copied): the links that open them, what may be
// done to a gift, the pinned list a change makes, and the words of a
// rarity or a price.

const HOSTS = /^(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)$/i;
const SLUG = /^[A-Za-z0-9_-]{1,100}$/;
const KINDS = { nft: 'unique', giftcode: 'code' };

/**
 * What a gift link names: `{ kind: 'unique' | 'code', slug }` for
 * t.me/nft/<slug>, t.me/giftcode/<slug> and tg://nft?slug=…,
 * tg://giftcode?slug=…, or null for anything else.
 */
export const giftLinkOf = (href) => {
  let url;
  try {
    url = new URL(String(href ?? '').trim());
  } catch {
    return null;
  }
  if (url.username || url.password) {
    return null;
  }
  let head = null;
  let slug = null;
  if (url.protocol === 'tg:') {
    head = url.hostname;
    slug = url.searchParams.get('slug');
  } else if (
    ['http:', 'https:'].includes(url.protocol) &&
    HOSTS.test(url.hostname)
  ) {
    const [first, name, ...more] = url.pathname.split('/').filter(Boolean);
    head = more.length === 0 ? first : null;
    slug = name;
  }
  return Object.hasOwn(KINDS, head ?? '') && SLUG.test(slug ?? '')
    ? { kind: KINDS[head], slug }
    : null;
};

/** The gift code a message's service action or media holds, or null. */
export const giftCodeSlugOf = (raw) =>
  [raw?.action, raw?.media]
    .map((one) => one?.slug)
    .find((slug) => typeof slug === 'string' && SLUG.test(slug)) ?? null;

/** The card of a message's gift code media: `{ kind: 'gift-code', slug, months }`. */
export const giftCodeCardOf = (media) => ({
  kind: 'gift-code',
  slug: giftCodeSlugOf({ media }) ?? '',
  months: Math.max(1, Math.round((Number(media?.days) || 30) / 30)),
});

export const GIFT_EVENT = 'ms-gift-open';

/**
 * Asks the gift host (mounted once, in the app) to open what `href`
 * names; true when it is a gift link and a host took it.
 */
export const openGiftLink = (href) => {
  const link = giftLinkOf(href);
  if (!link || !globalThis.dispatchEvent) {
    return false;
  }
  const detail = { ...link, handled: false };
  globalThis.dispatchEvent(new CustomEvent(GIFT_EVENT, { detail }));
  return detail.handled;
};

const open = (kind, slug) =>
  globalThis.dispatchEvent?.(
    new CustomEvent(GIFT_EVENT, { detail: { kind, slug, handled: false } })
  );

/** Opens a gift code's dialog (a service line's or a card's button). */
export const openGiftCode = (slug) => open('code', slug);

/** Opens a unique gift's viewer. */
export const openUniqueGift = (slug) => open('unique', slug);

/** Whether a unique gift may not be sent on yet at `now` (ms). */
export const transferWaits = (gift, now = Date.now()) =>
  Number(gift?.canTransferAt) * 1000 > now;

/**
 * What the owner may do to a received gift: `{ toggle, convert, upgrade,
 * transfer, pin, view }`. Others' gifts allow only viewing a unique one.
 */
export const giftActions = (gift, mine) => ({
  toggle: Boolean(mine) && gift.msgId > 0,
  convert: Boolean(mine) && !gift.unique && gift.convertStars > 0,
  upgrade: Boolean(mine) && !gift.unique && Boolean(gift.canUpgrade),
  transfer: Boolean(mine) && Boolean(gift.unique),
  pin: Boolean(mine) && (gift.msgId > 0 || Boolean(gift.savedId)),
  view: Boolean(gift.unique?.slug),
});

/** The part of a gift that names it to the server. */
export const giftRef = (gift, chat) =>
  gift.msgId > 0
    ? { chat: String(chat), msgId: gift.msgId }
    : { chat: String(chat), savedId: String(gift.savedId) };

const sameGift = (a, b) =>
  a.msgId > 0 ? a.msgId === b.msgId : a.savedId === b.savedId;

/**
 * The pins to send after pinning (`pin` true) or unpinning `gift`: this
 * one first, then the gifts already pinned, each as `{ msgId }` or
 * `{ savedId }`.
 */
export const pinnedAfter = (gifts, gift, pin) => {
  const rest = gifts.filter((g) => g.pinned && !sameGift(g, gift));
  return (pin ? [gift, ...rest] : rest).map((g) =>
    g.msgId > 0 ? { msgId: g.msgId } : { savedId: String(g.savedId) }
  );
};

/** The price line's words: a free upgrade or transfer, or its Stars. */
export const priceWords = (stars) =>
  stars > 0
    ? { key: 'chat.giftManage.priceStars', params: { count: stars } }
    : { key: 'chat.giftManage.priceFree', params: {} };

/** A rarity as `{ text }` ("1.5%") or `{ key }` (a word), or null. */
export const rarityWords = (item) => {
  if (Number.isFinite(item?.permille)) {
    return { text: `${item.permille / 10}%` };
  }
  return item?.rarity ? { key: `chat.giftManage.rarity.${item.rarity}` } : null;
};

/** How many of a unique gift exist, or null when Telegram did not say. */
export const availability = (gift) =>
  gift?.total > 0 ? { issued: gift.issued, total: gift.total } : null;

/** The CSS of a unique gift's backdrop. */
export const backdropStyle = (backdrop) =>
  backdrop
    ? {
        background: `radial-gradient(circle at 50% 40%, ${backdrop.center}, ${backdrop.edge})`,
        color: backdrop.text,
      }
    : {};
