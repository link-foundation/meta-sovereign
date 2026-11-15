import { contextualServer } from './vk-contextual-fixture.mjs';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';
const fixture = await contextualServer(process.argv[2]);
serveQuestionLinkFixture({
  ...fixture,
  stats: () => ({ sends: fixture.vk.calls.length, liveProvider: false }),
});
