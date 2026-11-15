import { evidenceHash } from '../automation/vk-reengage-evidence.js';
import {
  catalogId,
  stickerAccount,
  catalogQuery,
  selectCatalogStickers,
  invalidVkCatalog,
} from './vk-sticker-shape.js';

export const loadVkStickerCatalog = async (store, input) => {
  const accountId = stickerAccount(input);
  const record = await store.get(catalogId(accountId));
  if (
    record &&
    (record.source !== 'vk' ||
      record.kind !== 'vk-sticker-catalog' ||
      record.accountId !== accountId ||
      !Number.isFinite(record.updatedAt) ||
      (await evidenceHash(record.data)) !== record.dataHash)
  ) {
    invalidVkCatalog();
  }
  return record;
};
export const inspectVkStickerCatalog = async (store, input) => {
  const query = catalogQuery(input);
  const record = await loadVkStickerCatalog(store, input);
  if (!record) {
    return { ok: true, catalog: null, items: [], next: null };
  }
  const items = selectCatalogStickers(record.data.stickers, query);
  const greetingIds = selectCatalogStickers(record.data.stickers, {
    usableOnly: true,
    category: 'greeting',
  }).map((item) => item.id);
  return {
    ok: true,
    catalog: {
      accountId: record.accountId,
      updatedAt: record.updatedAt,
      packs: record.data.packs.length,
      stickers: record.data.stickers.length,
      usable: record.data.stickers.filter((item) => item.usable).length,
      keywords: record.data.dictionary.length,
      greetingIds,
    },
    packs: record.data.packs,
    matched: items.length,
    offset: query.offset,
    items: items.slice(query.offset, query.offset + 100),
    next: query.offset + 100 < items.length ? query.offset + 100 : null,
  };
};
