import { createVkCache } from '../sources/vk-cache.js';
import { exportVkCache } from '../sources/vk-cache-export.js';

/** Keep admitted reads and filesystem exports owned until store shutdown. */
export const createVkCacheRuntime = ({ store, ...options }) => {
  const service = createVkCache({ store, ...options });
  const pending = new Set();
  let closing = false;
  return {
    run(action, input, storeDir) {
      if (closing) {
        throw Object.assign(new Error('VK cache is closing'), {
          code: 'stopped',
        });
      }
      const task = Promise.resolve().then(() =>
        action === 'export'
          ? exportVkCache(store, input, { storeDir })
          : service[action](input)
      );
      pending.add(task);
      const done = () => pending.delete(task);
      task.then(done, done);
      return task;
    },
    async close() {
      closing = true;
      await Promise.allSettled([...pending]);
    },
  };
};
