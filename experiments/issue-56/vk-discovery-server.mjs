import { discoveryServer } from './vk-discovery-fixture.mjs';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';
const fixture = await discoveryServer();
serveQuestionLinkFixture({
  ...fixture,
  stats: () => ({
    relationshipEffects: fixture.effects,
    unexpectedMessages: fixture.messages(),
    liveProvider: false,
  }),
});
