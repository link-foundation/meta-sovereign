import { writeFile } from 'node:fs/promises';
import { vkTokenFixture } from './vk-token-fixture.mjs';
const fixture = await vkTokenFixture();
await writeFile(
  'ci-logs/vk-token-mcp-server.json',
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
console.log(JSON.stringify({ ...fixture.effects, resourcesClosed: true }));
