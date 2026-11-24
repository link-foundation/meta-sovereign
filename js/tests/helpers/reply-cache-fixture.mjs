import { startSnapshotFixture } from './browser-storage-fixture.mjs';

export const startReplyCacheFixture = (options = {}) =>
  startSnapshotFixture({
    ...options,
    entry: `export * from './js/src/storage/browser-store.js';
      export { createReplyCache } from './js/src/replies/reply-cache.js';
      export { buildReplyIndex } from './js/src/replies/reply-graph.js';`,
  });
