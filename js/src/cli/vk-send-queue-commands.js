import { defaultStoreDir } from '../storage/app-directory.js';
import {
  loadVkSendQueue,
  saveVkSendQueue,
} from '../automation/vk-queue-inspection.js';

const patchFor = (args) => {
  const patch = {};
  for (const [flag, key] of [
    ['enabled', 'enabled'],
    ['mark-read', 'markRead'],
    ['typing', 'typing'],
  ]) {
    if (args[flag] !== undefined) {
      if (![true, false, 'true', 'false'].includes(args[flag])) {
        throw new Error(`${flag} must be true or false`);
      }
      patch[key] = args[flag] === true || args[flag] === 'true';
    }
  }
  if (args['chars-per-minute'] !== undefined) {
    patch.charsPerMinute = Number(args['chars-per-minute']);
  }
  return patch;
};
export const createVkSendQueueCommands = ({
  openStore,
  openReadOnly = openStore,
}) => ({
  'vk-send-queue': async (args, log) => {
    const patch = patchFor(args);
    const changing = Object.keys(patch).length > 0;
    const store = await (changing ? openStore : openReadOnly)(
      args.store ?? defaultStoreDir()
    );
    try {
      const answer = await (changing
        ? saveVkSendQueue(store, patch)
        : loadVkSendQueue(store));
      log(JSON.stringify(answer, null, 2));
      return 0;
    } finally {
      await store.close?.();
    }
  },
});
