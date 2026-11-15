import { onlineServer } from './vk-online-fixture.mjs';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';

const fixture = await onlineServer();
serveQuestionLinkFixture({
  ...fixture,
  stats: () => ({
    mockedProviderCalls: fixture.fake.calls.length,
    messages: fixture.messages(),
    liveProvider: false,
  }),
});
