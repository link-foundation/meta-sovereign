import { defaultStoreDir } from '../storage/app-directory.js';
import { createVkCache } from '../sources/vk-cache.js';
import { exportVkCache } from '../sources/vk-cache-export.js';
import { safeMessage } from '../server/redact.js';

export const createVkCacheCommands = ({
  openStore,
  openReadOnly = openStore,
  create = createVkCache,
} = {}) => ({
  'vk-cache': async (args, log) => {
    const action = args._?.[0] ?? 'inspect';
    if (!['inspect', 'refresh', 'export'].includes(action)) {
      return 1;
    }
    const storeDir = args.store ?? defaultStoreDir();
    const input = {
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
    let store;
    try {
      if (args.restart !== undefined && ![true, false].includes(args.restart)) {
        throw new Error('restart must be boolean');
      }
      store = await (action === 'refresh' ? openStore : openReadOnly)(storeDir);
      const result =
        action === 'export'
          ? await exportVkCache(store, input, { storeDir })
          : await create({ store })[action](input);
      log(JSON.stringify(result, null, 2));
      return 0;
    } catch (error) {
      log(
        JSON.stringify({
          ok: false,
          code: error.code ?? 'failed',
          error: safeMessage(error),
        })
      );
      return 1;
    } finally {
      await store?.close();
    }
  },
});
