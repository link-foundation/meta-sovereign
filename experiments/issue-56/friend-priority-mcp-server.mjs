import { writeFile } from 'node:fs/promises';
import { friendsServer, friendsAdapter } from './vk-friends-fixture.mjs';
const fixture = await friendsServer({
  adapter: friendsAdapter({
    methods: {
      'friends.getRequests': () => ({ count: 2, items: [7, 8] }),
    },
  }),
});
await writeFile(
  'ci-logs/friend-priority-mcp-server.json',
  JSON.stringify({ base: fixture.base })
);
console.log(fixture.base);
await new Promise((resolve) => {
  const stop = () => {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    resolve();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
});
await fixture.close();
console.log(
  JSON.stringify({
    resourcesClosed: true,
    providerWrites: fixture.effects.length,
    messages: fixture.messages(),
    liveProvider: false,
  })
);
