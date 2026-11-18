import { startSnapshotFixture } from './browser-storage-fixture.mjs';

export const startBrowserMergeFixture = (options = {}) =>
  startSnapshotFixture({
    ...options,
    entry: `export * from './js/src/storage/browser-store.js';
      export { openCausalBrowserStore } from './js/src/storage/open-browser-store.js';`,
    // The exact parent has the production migration and causal wrappers, but
    // no coordinated opening yet. This is its existing DOM boot sequence.
    beforeEntry: `export * from './js/src/storage/browser-store.js';
      import { createBrowserStore } from './js/src/storage/browser-store.js';
      import { withCausalWrites } from './js/src/storage/causal-writes.js';
      import { migrateBrowserStore } from './js/src/storage/migrations/browser-runner.js';
      export const openCausalBrowserStore = async ({driver}) => {
        const store = await createBrowserStore({driver});
        await migrateBrowserStore(store);
        return withCausalWrites(store);
      };`,
  });
