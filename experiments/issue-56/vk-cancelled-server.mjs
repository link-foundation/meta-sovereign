import { cancelledServer } from './vk-cancelled-fixture.mjs';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';
const fixture = await cancelledServer();
serveQuestionLinkFixture({
  ...fixture,
  stats: () => ({
    syntheticPromptCalls: fixture.effects.filter(
      (row) => row.action === 'prompt'
    ).length,
    syntheticBlockCalls: fixture.effects.filter((row) => row.action === 'block')
      .length,
    unexpectedMessages: fixture.messages(),
    liveProvider: false,
  }),
});
