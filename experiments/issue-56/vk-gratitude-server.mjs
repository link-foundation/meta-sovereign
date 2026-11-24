import { gratitudeServer } from './vk-gratitude-fixture.mjs';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';
const fixture = await gratitudeServer();
serveQuestionLinkFixture({
  ...fixture,
  stats: () => ({ sends: fixture.vk.calls.length, liveProvider: false }),
});
