import { inspectVkStickerCatalog } from '../sources/vk-sticker-cache.js';
import { filterReceivedVkStickers } from '../sources/vk-sticker-shape.js';
import { vkCachedReadApi } from './vk-cached-read-api.js';

export const createVkStickerApi = (options) => {
  const api = vkCachedReadApi(options, 'stickers', inspectVkStickerCatalog);
  return {
    inspectVkStickers: api.inspect,
    refreshVkStickers: api.refresh,
    exportVkStickers: api.export,
    filterVkStickers: (input) => filterReceivedVkStickers(input.attachments),
  };
};
