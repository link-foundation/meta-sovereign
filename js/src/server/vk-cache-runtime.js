import { createVkCache } from '../sources/vk-cache.js';
import { exportVkCache } from '../sources/vk-cache-export.js';
import { ownedOperations } from './owned-operations.js';

/** Keep admitted reads and filesystem exports owned until store shutdown. */
export const createVkCacheRuntime = ({ store, ...options }) => {
  const service = createVkCache({ store, ...options });
  return ownedOperations(
    (action, input, storeDir) =>
      action === 'export'
        ? exportVkCache(store, input, { storeDir })
        : service[action](input),
    'VK cache'
  );
};
