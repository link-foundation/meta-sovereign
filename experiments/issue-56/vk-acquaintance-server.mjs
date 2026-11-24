import { acquaintanceServer } from './vk-acquaintance-fixture.mjs';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';
const fixture = await acquaintanceServer();
serveQuestionLinkFixture({
  ...fixture,
  stats: () => ({ sends: fixture.vk.calls.length, liveProvider: false }),
});
