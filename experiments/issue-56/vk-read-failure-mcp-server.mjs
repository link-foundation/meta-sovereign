import { legacyCatalogsServer } from './vk-legacy-catalogs-fixture.mjs';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';
const fixture = await legacyCatalogsServer({ invalid: true });
serveQuestionLinkFixture({
  ...fixture,
  stats: () => ({
    providerWrites: fixture.effects.length,
    liveProvider: false,
  }),
});
