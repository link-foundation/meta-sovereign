import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadVkStickerCatalog } from './vk-sticker-cache.js';
import {
  filterReceivedVkStickers,
  selectCatalogStickers,
  catalogQuery,
} from './vk-sticker-shape.js';
import { checkFolder } from './telegram-export-paths.js';

const writeParts = async (folder, name, items) => {
  const files = [];
  for (let offset = 0; offset < Math.max(1, items.length); offset += 1497) {
    const file = `${name}-${files.length + 1}.json`;
    await fs.writeFile(
      path.join(folder, file),
      `[\n${items
        .slice(offset, offset + 1497)
        .map((item) => JSON.stringify(item))
        .join(',\n')}\n]\n`,
      { flag: 'wx' }
    );
    files.push(file);
  }
  return files;
};
/** Source scripts download metadata JSON; artwork remains a provider reference. */
export const exportVkStickerCatalog = async (
  store,
  input,
  { storeDir } = {}
) => {
  const query = catalogQuery(input);
  const record = await loadVkStickerCatalog(store, input);
  if (!record && input.attachments === undefined) {
    throw Object.assign(
      new Error('Refresh the sticker catalog before exporting'),
      { code: 'not-found' }
    );
  }
  const checked = await checkFolder(input.folder, { storeDir });
  if (!checked.ok) {
    throw Object.assign(new Error(checked.code), { code: checked.code });
  }
  const filtered =
    input.attachments === undefined
      ? null
      : filterReceivedVkStickers(input.attachments);
  await fs.mkdir(checked.folder, { recursive: false });
  const files = {};
  if (record) {
    const { data } = record;
    files.packs = await writeParts(checked.folder, 'sticker-packs', data.packs);
    files.stickers = await writeParts(
      checked.folder,
      'usable-stickers',
      data.stickers.filter((item) => item.usable)
    );
    files.keywords = await writeParts(
      checked.folder,
      'keywords',
      data.dictionary
    );
    files.greetingIds = await writeParts(
      checked.folder,
      'greeting-ids',
      selectCatalogStickers(data.stickers, {
        usableOnly: true,
        category: 'greeting',
      }).map((item) => item.id)
    );
    files.selection = await writeParts(
      checked.folder,
      'selection',
      selectCatalogStickers(data.stickers, query)
    );
  }
  if (filtered) {
    files.received = await writeParts(
      checked.folder,
      'received-stickers',
      filtered.stickers
    );
    files.products = await writeParts(
      checked.folder,
      'products',
      filtered.products
    );
  }
  const manifest = {
    source: 'vk',
    accountId: Number(input.accountId),
    updatedAt: record?.updatedAt ?? null,
    artworkDownloaded: false,
    files,
  };
  await fs.writeFile(
    path.join(checked.folder, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    { flag: 'wx' }
  );
  return { ok: true, folder: checked.folder, ...manifest };
};
