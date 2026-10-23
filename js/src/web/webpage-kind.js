// What a link preview is a preview of (R-Y221; learned, never copied): a
// story, a sticker or emoji set, a chat theme, a unique gift. Telegram
// tells it in the page's `attributes`; the preview card names it above its
// title ("Sticker set"). Pure.

const KINDS = {
  WebPageAttributeStory: () => ({ badge: 'story' }),
  WebPageAttributeStickerSet: (a) => ({
    badge: a.emojis ? 'emojiSet' : 'stickerSet',
  }),
  WebPageAttributeTheme: () => ({ badge: 'theme' }),
  WebPageAttributeUniqueStarGift: (a) => ({
    badge: 'uniqueGift',
    // "Plush Pepe #12", when the page has no title of its own.
    name: a.gift?.title ? `${a.gift.title} #${Number(a.gift.num) || 0}` : null,
  }),
};

/** `{ badge, name? }` for a page's attributes, or null for a plain page. */
export const webpageKindOf = (attributes) => {
  for (const attribute of Array.isArray(attributes) ? attributes : []) {
    const found = KINDS[attribute?.className]?.(attribute);
    if (found) {
      return found;
    }
  }
  return null;
};
