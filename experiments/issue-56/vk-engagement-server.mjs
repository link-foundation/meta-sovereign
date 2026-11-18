import { engagementServer } from './vk-engagement-fixture.mjs';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';
const fixture = await engagementServer();
serveQuestionLinkFixture({
  ...fixture,
  stats: () => ({ sends: fixture.vk.calls.length, liveProvider: false }),
});
