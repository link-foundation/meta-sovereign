// Pure helpers of the Telegram Stars screens (R-Y176; learned, never
// copied): amounts, a transaction's label, a paid reaction's amount and a
// paid-media message's previews.

/** The most Stars one paid reaction may carry (Telegram's usual limit). */
export const PAID_MAX = 2500;

/** Stars as the rows show them: whole numbers, nanos as decimals. */
export const starsText = (amount) => {
  const n = Number(amount) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '');
};

/** An amount with its sign: "+100" or "−50" (a true minus). */
export const signedStars = (amount) => {
  const n = Number(amount) || 0;
  return `${n < 0 ? '−' : '+'}${starsText(Math.abs(n))}`;
};

const SOURCES = {
  fragment: 'chat.stars.src.fragment',
  appstore: 'chat.stars.src.appstore',
  playmarket: 'chat.stars.src.playmarket',
  premiumbot: 'chat.stars.src.premiumbot',
  ads: 'chat.stars.src.ads',
  api: 'chat.stars.src.api',
};
const PURPOSES = {
  gift: 'chat.stars.kind.gift',
  reaction: 'chat.stars.kind.reaction',
  media: 'chat.stars.kind.media',
  subscription: 'chat.stars.kind.subscription',
};

/**
 * What a row is called: the transaction's title, else what it was for,
 * else where it came from. Returns `{ key }` (an i18n key to translate)
 * or `{ text }` (ready).
 */
export const rowLabel = (row) => {
  if (row.title) {
    return { text: row.title };
  }
  if (PURPOSES[row.kind]) {
    return { key: PURPOSES[row.kind] };
  }
  return row.source?.name
    ? { text: row.source.name }
    : { key: SOURCES[row.source?.kind] ?? 'chat.stars.src.unknown' };
};

/** The i18n key of where a row came from, or '' when it is a person's name. */
export const sourceKey = (row) =>
  row.source?.kind === 'peer' && row.source.name
    ? ''
    : (SOURCES[row.source?.kind] ?? 'chat.stars.src.unknown');

/** A paid reaction's amount, kept to 1..max whatever was typed. */
export const clampPaid = (value, max = PAID_MAX) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(1, n)) : 1;
};

/** Whether the user has enough Stars (an unknown balance does not stop). */
export const canAfford = (balance, price) =>
  typeof balance !== 'number' || balance >= price;

/**
 * A paid-media message's state from its raw media: `{ stars, locked,
 * items }`, or null for any other media. A locked item is a preview
 * (`w`, `h`, `duration`, `thumb` what `thumbOf` makes of its thumbnail);
 * an unlocked one is `{ media }` (the real photo or document).
 */
export const paidOf = (media, thumbOf = () => null) => {
  if (media?.className !== 'MessageMediaPaidMedia') {
    return null;
  }
  const items = (media.extendedMedia ?? []).map((item) =>
    item?.className === 'MessageExtendedMedia'
      ? { unlocked: true, media: item.media }
      : {
          unlocked: false,
          w: Number(item?.w ?? 0),
          h: Number(item?.h ?? 0),
          duration: Number(item?.videoDuration ?? 0) || null,
          thumb: thumbOf(item?.thumb),
        }
  );
  return {
    stars: Number(media.starsAmount ?? 0) || 0,
    locked: items.some((item) => !item.unlocked),
    items,
  };
};

/**
 * What the paid reaction chip shows from a message's reactions:
 * `{ count, mine, top }` or null when it has no paid reaction. `top` are
 * the top senders (`mine`, `anonymous`, `count`).
 */
export const paidReactionOf = (reactions) => {
  const one = (reactions?.results ?? []).find(
    (r) => r?.reaction?.className === 'ReactionPaid'
  );
  if (!one) {
    return null;
  }
  const top = (reactions.topReactors ?? [])
    .filter((r) => Number(r?.count) > 0)
    .map((r) => ({
      mine: Boolean(r.my),
      anonymous: Boolean(r.anonymous) || !r.peerId,
      count: Number(r.count) || 0,
    }));
  return {
    count: Number(one.count) || 0,
    mine: top.filter((r) => r.mine).reduce((sum, r) => sum + r.count, 0),
    top,
  };
};
