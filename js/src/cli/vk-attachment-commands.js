import { defaultStoreDir } from '../storage/app-directory.js';
import {
  listVkAttachments,
  saveVkAttachmentSettings,
} from '../sources/vk-attachment-metadata.js';

export const createVkAttachmentCommands = ({
  openStore,
  openReadOnly = openStore,
}) => ({
  'vk-attachments': async (args, log) => {
    const changing = args.enabled !== undefined;
    if (changing && ![true, false, 'true', 'false'].includes(args.enabled)) {
      throw new Error('enabled must be true or false');
    }
    const store = await (changing ? openStore : openReadOnly)(
      args.store ?? defaultStoreDir()
    );
    try {
      const result = changing
        ? await saveVkAttachmentSettings(store, {
            enabled: args.enabled === true || args.enabled === 'true',
          })
        : await listVkAttachments(store, {
            after: args.after ?? '',
            limit: Number(args.limit ?? 50),
          });
      log(JSON.stringify(result, null, 2));
      return 0;
    } finally {
      await store.close?.();
    }
  },
});
