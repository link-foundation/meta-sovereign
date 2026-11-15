import { wallServer } from './vk-wall-fixture.mjs';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';
const fixture = await wallServer();
serveQuestionLinkFixture({
  ...fixture,
  stats: () => ({
    syntheticWallCalls: fixture.effects.length,
    unexpectedMessages: fixture.messages(),
    liveProvider: false,
  }),
});
