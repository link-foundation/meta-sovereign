import { reengageServer } from './vk-reengage-fixture.mjs';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';
const fixture = await reengageServer();
serveQuestionLinkFixture({
  ...fixture,
  stats: () => ({
    syntheticSequenceCalls: fixture.effects.length,
    unexpectedMessages: fixture.messages(),
    liveProvider: false,
  }),
});
