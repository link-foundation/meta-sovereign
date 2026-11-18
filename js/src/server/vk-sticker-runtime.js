import { createVkStickerCatalog } from '../sources/vk-sticker-catalog.js';
import { exportVkStickerCatalog } from '../sources/vk-sticker-export.js';
import { filterReceivedVkStickers } from '../sources/vk-sticker-shape.js';
import { ownedOperations } from './owned-operations.js';

export const createVkStickerRuntime = ({ store, ...options }) => {
  const service = createVkStickerCatalog({ store, ...options });
  return ownedOperations((action, input, storeDir) => {
    if (action === 'export') {
      return exportVkStickerCatalog(store, input, { storeDir });
    }
    if (action === 'filter') {
      return filterReceivedVkStickers(input.attachments);
    }
    return service[action](input);
  }, 'VK sticker catalog');
};
