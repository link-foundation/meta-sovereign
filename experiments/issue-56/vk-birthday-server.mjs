import { birthdayServer } from './vk-birthday-fixture.mjs';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';
const fixture = await birthdayServer();
serveQuestionLinkFixture({
  ...fixture,
  stats: () => ({
    syntheticBirthdayCalls: fixture.effects.length,
    unexpectedMessages: fixture.messages(),
    liveProvider: false,
  }),
});
