import { writeFile } from 'node:fs/promises';
import { messageDefaultsServer } from './vk-message-defaults-fixture.mjs';
const fixture = await messageDefaultsServer();
await writeFile(
  'ci-logs/message-defaults-mcp-server.json',
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
