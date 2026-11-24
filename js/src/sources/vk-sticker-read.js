import {
  catalogPack,
  catalogSticker,
  invalidVkCatalog,
  stickerNumber,
} from './vk-sticker-shape.js';
import { matchesCollection } from '../greetings/collections.js';

const bounded = (items, limit) => {
  if (!Array.isArray(items) || items.length > limit) {
    invalidVkCatalog();
  }
  return items;
};
const products = (response) => {
  const items = bounded(response?.items, 2000);
  if (response.count !== items.length) {
    invalidVkCatalog();
  }
  return items;
};
const dictionaryOf = (response) => {
  const dictionary = bounded(response?.dictionary, 10000);
  let descriptors = 0;
  if (
    response.count !== dictionary.length ||
    (response.chunks_count ?? 1) !== 1
  ) {
    invalidVkCatalog();
  }
  return dictionary.map((row) => {
    if (
      !bounded(row?.words, 100).every(
        (word) => typeof word === 'string' && word.length <= 100
      )
    ) {
      invalidVkCatalog();
    }
    const entries = ['user_stickers', 'stickers', 'promoted_stickers'].flatMap(
      (key) =>
        bounded(row[key] ?? [], 20000).map((item) => {
          descriptors++;
          const packId = item?.product_id ?? item?.pack_id;
          if (
            descriptors > 200000 ||
            !stickerNumber(item?.sticker_id) ||
            !stickerNumber(packId)
          ) {
            invalidVkCatalog();
          }
          return { id: item.sticker_id, packId };
        })
    );
    return { words: row.words, stickers: entries };
  });
};
const mergePacks = (rawPacks) => {
  const packs = new Map();
  const stickers = new Map();
  for (const raw of rawPacks) {
    const pack = catalogPack(raw);
    if (packs.has(pack.id) || pack.stickerIds.length > 1000) {
      invalidVkCatalog();
    }
    packs.set(pack.id, pack);
    for (const rawSticker of raw.stickers) {
      const item = catalogSticker(rawSticker, pack);
      if (stickers.has(item.id) || stickers.size >= 20000) {
        invalidVkCatalog();
      }
      stickers.set(item.id, item);
    }
  }
  return { packs, stickers };
};

/** Native methods offer no offset; reject partial/chunked or oversized evidence. */
export const readVkStickerCatalog = async (live, token) => {
  const owned = products(
    await live.call(
      'store.getProducts',
      {
        type: 'stickers',
        filters: 'purchased,active',
        extended: 1,
      },
      token
    )
  );
  const dictionary = dictionaryOf(
    await live.call(
      'store.getStickersKeywords',
      {
        all_products: 1,
        need_stickers: 1,
      },
      token
    )
  );
  const ownedIds = new Set(owned.map((pack) => pack.id));
  const extraIds = [
    ...new Set(
      dictionary
        .filter((row) => matchesCollection({ keywords: row.words }, 'greeting'))
        .flatMap((row) => row.stickers.map((item) => item.packId))
    ),
  ].filter((id) => !ownedIds.has(id));
  if (extraIds.length > 500) {
    invalidVkCatalog();
  }
  for (let offset = 0; offset < extraIds.length; offset += 50) {
    const ids = extraIds.slice(offset, offset + 50);
    const extra = products(
      await live.call(
        'store.getProducts',
        {
          type: 'stickers',
          product_ids: ids.join(','),
          extended: 1,
        },
        token
      )
    );
    if (
      extra.length !== ids.length ||
      extra.some((pack) => !ids.includes(pack.id))
    ) {
      invalidVkCatalog();
    }
    owned.push(...extra);
  }
  const { packs, stickers } = mergePacks(owned);
  for (const row of dictionary) {
    for (const item of row.stickers) {
      const sticker = stickers.get(String(item.id));
      if (sticker && sticker.packId !== item.packId) {
        invalidVkCatalog();
      }
      if (sticker) {
        sticker.keywords = [...new Set([...sticker.keywords, ...row.words])];
      }
    }
  }
  return {
    packs: [...packs.values()],
    stickers: [...stickers.values()],
    dictionary,
  };
};
