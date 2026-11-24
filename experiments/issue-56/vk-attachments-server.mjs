import { attachmentServer } from './vk-attachments-fixture.mjs';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';

const fixture = await attachmentServer();
serveQuestionLinkFixture({
  ...fixture,
  stats: () => ({ providerEffects: fixture.effects(), liveProvider: false }),
});
