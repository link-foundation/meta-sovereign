import { identityServer } from './vk-identity-fixture.mjs';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';
const fixture = await identityServer();
serveQuestionLinkFixture({
  ...fixture,
  stats: () => ({ sends: fixture.vk.calls.length, liveProvider: false }),
});
