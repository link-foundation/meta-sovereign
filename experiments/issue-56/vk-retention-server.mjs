import { retentionServer } from './vk-retention-fixture.mjs';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';
import { isTombstone } from '../../js/src/storage/soft-delete.js';
const fixture = await retentionServer();
serveQuestionLinkFixture({
  ...fixture,
  stats: async () => ({
    syntheticRetentionCalls: fixture.effects.length,
    localTombstones: (
      await fixture.store.query(
        (row) => row.source === 'vk' && isTombstone(row)
      )
    ).length,
    unexpectedMessages: fixture.messages(),
    liveProvider: false,
  }),
});
