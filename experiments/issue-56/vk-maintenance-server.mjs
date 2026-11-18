import { maintenanceServer } from './vk-maintenance-fixture.mjs';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';
const fixture = await maintenanceServer();
serveQuestionLinkFixture({
  ...fixture,
  stats: () => ({
    syntheticDeletes: fixture.effects.length,
    messages: fixture.messages(),
    liveProvider: false,
  }),
});
