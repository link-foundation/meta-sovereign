import { greetServer } from './vk-greet-fixture.mjs';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';
const fixture = await greetServer();
serveQuestionLinkFixture({
  ...fixture,
  stats: () => ({
    syntheticGreetingCalls: fixture.effects.length,
    unexpectedMessages: fixture.messages(),
    liveProvider: false,
  }),
});
