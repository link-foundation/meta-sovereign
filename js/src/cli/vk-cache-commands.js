import { createVkCache } from '../sources/vk-cache.js';
import { exportVkCache } from '../sources/vk-cache-export.js';
import { createVkReadCommands } from './vk-read-commands.js';

export const createVkCacheCommands = ({
  create = createVkCache,
  ...options
} = {}) =>
  createVkReadCommands({
    ...options,
    command: 'vk-cache',
    create,
    exportData: exportVkCache,
    makeInput: (args) => {
      if (args.restart !== undefined && ![true, false].includes(args.restart)) {
        throw new Error('restart must be boolean');
      }
      return {
        accountId: args.account,
        peerId: args.peer,
        kind: args.kind ?? 'history',
        maxPages: Number(args['max-pages'] ?? 5),
        restart: args.restart === true,
        folder: args.folder,
        ...(args['page-offset'] !== undefined
          ? { pageOffset: Number(args['page-offset']) }
          : {}),
      };
    },
  });
