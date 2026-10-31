import {
  matchesCollection,
  stickerIdentity,
} from '../greetings/collections.js';
export const mergeCollectionItems = (items) => {
  const merged = new Map();
  for (const item of items) {
    const id = stickerIdentity(item);
    merged.set(id, { ...merged.get(id), ...item });
  }
  return [...merged.values()];
};
export const chosenStickers = (collection, pool) =>
  mergeCollectionItems([
    ...collection.stickers,
    ...(collection.automatic
      ? pool.filter(
          (item) =>
            item.network === collection.source &&
            matchesCollection(item, collection.category)
        )
      : []),
  ]).slice(0, 200);
export const restoreCollectionStickers = async (api, collection) => {
  const queries = new Set();
  const sets = new Map();
  const names = new Set();
  for (const item of collection.stickers) {
    if (item.lookupQuery) {
      queries.add(item.lookupQuery);
    } else if (item.shortName) {
      names.add(item.shortName);
    } else if (item.setId) {
      sets.set(item.setId, item.setAccessHash);
    }
  }
  const stickers = [];
  for (const [id, accessHash] of sets) {
    const answer = accessHash
      ? await api.telegramStickerSetBox({ id, accessHash })
      : await api.telegramStickerSet({ id });
    if (answer?.ok) {
      stickers.push(...answer.stickers);
    }
  }
  for (const shortName of names) {
    const answer = await api.telegramStickerSetBox({ shortName });
    if (answer?.ok) {
      stickers.push(...answer.stickers);
    }
  }
  for (const q of queries) {
    const answer = await api.telegramStickerSearch({ q });
    if (answer?.ok) {
      stickers.push(...answer.stickers);
    }
  }
  return stickers;
};
