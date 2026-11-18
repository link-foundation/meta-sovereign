import { matchesCollection } from '../greetings/collections.js';
import { vkStickerPreview } from '../greetings/catalog.js';

export const invalidVkCatalog = () => {
  throw Object.assign(new Error('Incomplete VK sticker catalog evidence'), {
    code: 'incomplete',
  });
};
export const stickerNumber = (id) => Number.isSafeInteger(id) && id > 0;
export const stickerAccount = (input = {}) => {
  const accountId = Number(input.accountId);
  if (!stickerNumber(accountId) || accountId >= 2000000000) {
    throw Object.assign(new Error('A positive VK account ID is required'), {
      code: 'bad-request',
    });
  }
  return accountId;
};
export const catalogId = (accountId) => `vk-stickers:${accountId}`;
const flag = (value) => value === true || value === 1;
const preview = (images) => {
  const image = images?.find(
    (item) => item.width === 512 && item.height === 512
  );
  try {
    const url = new URL(image?.url);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      /(^|\.)(vk\.com|userapi\.com|vkuseraudio\.net)$/u.test(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
};
export const catalogPack = (pack) => {
  if (
    !stickerNumber(pack?.id) ||
    pack.type !== 'stickers' ||
    !Array.isArray(pack.stickers)
  ) {
    invalidVkCatalog();
  }
  return {
    id: pack.id,
    title: String(pack.title ?? '').slice(0, 120),
    purchased: flag(pack.purchased),
    active: flag(pack.active),
    stickerIds: pack.stickers.map((sticker) => {
      if (!stickerNumber(sticker.sticker_id)) {
        invalidVkCatalog();
      }
      return sticker.sticker_id;
    }),
  };
};
export const catalogSticker = (sticker, pack) => {
  const id = sticker.sticker_id;
  if (!stickerNumber(id)) {
    invalidVkCatalog();
  }
  return {
    network: 'vk',
    id: String(id),
    packId: pack.id,
    pack: pack.title,
    owned: pack.purchased,
    active: pack.active,
    usable: pack.purchased && pack.active && flag(sticker.is_allowed),
    previewUrl: preview(sticker.images) ?? vkStickerPreview(id),
    previewWithBackground: preview(sticker.images_with_background),
    lightPreviewUrl: preview(
      sticker.render?.images?.filter((item) => item.theme === 'light')
    ),
    darkPreviewUrl: preview(
      sticker.render?.images?.filter((item) => item.theme === 'dark')
    ),
    keywords: [],
  };
};
export const catalogQuery = (input) => {
  const { offset = 0, usableOnly = true, category = 'all', q = '' } = input;
  const packId = input.packId ? Number(input.packId) : null;
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 20000 ||
    typeof usableOnly !== 'boolean' ||
    !['all', 'greeting', 'birthday', 'thanks', 'farewell', 'custom'].includes(
      category
    ) ||
    typeof q !== 'string' ||
    q.length > 100 ||
    (packId !== null && !stickerNumber(packId))
  ) {
    throw Object.assign(new Error('Invalid sticker catalog filter'), {
      code: 'bad-request',
    });
  }
  return {
    offset,
    q: q.trim().toLocaleLowerCase(),
    category,
    usableOnly,
    packId,
  };
};
export const selectCatalogStickers = (stickers, query) =>
  stickers.filter(
    (item) =>
      (!query.usableOnly || item.usable) &&
      (!query.packId || item.packId === query.packId) &&
      (query.category === 'all' || matchesCollection(item, query.category)) &&
      (!query.q ||
        [item.id, item.pack, ...item.keywords]
          .join(' ')
          .toLocaleLowerCase()
          .includes(query.q))
  );

const receivedSticker = (item, key) => ({
  packId: Number(
    item?.productId ?? item?.product_id ?? item?.metadata?.product_id
  ),
  id: Number(item?.sticker_id ?? item?.externalId ?? item?.id ?? key),
});
/** The reference filters received-attachments.json by productId, without claiming ownership. */
export const filterReceivedVkStickers = (input) => {
  if (
    !input ||
    typeof input !== 'object' ||
    Object.keys(input).length > 10000
  ) {
    invalidVkCatalog();
  }
  const stickers = [];
  const products = new Set();
  for (const [key, item] of Object.entries(input)) {
    const { packId, id } = receivedSticker(item, key);
    if (!stickerNumber(packId) || !stickerNumber(id)) {
      continue;
    }
    stickers.push({ id, packId });
    products.add(packId);
  }
  return { ok: true, stickers, products: [...products].sort((a, b) => a - b) };
};
