import { friendsServer } from './vk-friends-fixture.mjs';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';
const fixture = await friendsServer();
serveQuestionLinkFixture({
  ...fixture,
  stats: () => ({
    syntheticFriendCalls: fixture.effects.length,
    messages: fixture.messages(),
    liveProvider: false,
  }),
});
