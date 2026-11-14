import { createBrowserStore, pickBrowserDriver } from './browser-store.js';
import { coordinateSnapshots } from './browser-coordination.js';
import { withCausalWrites } from './causal-writes.js';
import { migrateBrowserStore } from './migrations/browser-runner.js';
import { CURRENT_SCHEMA } from './migrations/index.js';

// No owner operations exist during migration. A competing boot may finish the
// same idempotent migration first; reopen its committed root before retrying.
// Do not apply this retry to a page's later owner edits or failed migrations.
export const openCausalBrowserStore = async ({
  driver = pickBrowserDriver(),
  signal,
  onError,
} = {}) => {
  for (let attempt = 0; ; attempt += 1) {
    const store = await createBrowserStore({ driver });
    try {
      await migrateBrowserStore(store);
    } catch (error) {
      if (
        attempt < 3 &&
        ['STORE_SNAPSHOT_CHANGED', 'STORE_SNAPSHOT_BUSY'].includes(error?.code)
      ) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
        continue;
      }
      throw error;
    }
    store[coordinateSnapshots]({ schema: CURRENT_SCHEMA, signal, onError });
    return withCausalWrites(store);
  }
};
