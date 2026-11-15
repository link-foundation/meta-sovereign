import { promises as fs } from 'node:fs';
import { createVkStickerCatalog } from '../sources/vk-sticker-catalog.js';
import { exportVkStickerCatalog } from '../sources/vk-sticker-export.js';
import { filterReceivedVkStickers } from '../sources/vk-sticker-shape.js';
import { createVkReadCommands } from './vk-read-commands.js';

export const createVkStickerCommands = ({
  create = createVkStickerCatalog,
  ...options
} = {}) =>
  createVkReadCommands({
    ...options,
    command: 'vk-stickers',
    create,
    exportData: exportVkStickerCatalog,
    filter: filterReceivedVkStickers,
    makeInput: async (args) => {
      if (
        args['usable-only'] !== undefined &&
        ![true, false].includes(args['usable-only'])
      ) {
        throw new Error('usable-only must be boolean');
      }
      let attachments;
      if (args.file) {
        if ((await fs.stat(args.file)).size > 2097152) {
          throw new Error('Attachment file exceeds 2 MiB');
        }
        attachments = JSON.parse(await fs.readFile(args.file, 'utf8'));
      }
      return {
        accountId: args.account,
        offset: Number(args.offset ?? 0),
        q: args.query,
        packId: args.pack,
        category: args.category,
        usableOnly: args['usable-only'] !== false,
        folder: args.folder,
        ...(attachments === undefined ? {} : { attachments }),
      };
    },
  });
