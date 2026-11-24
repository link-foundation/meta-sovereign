import { writeFile } from 'node:fs/promises';
import { friendsJob, friendsServer } from './vk-friends-fixture.mjs';
const fixture = await friendsServer();
const job = friendsJob(fixture.store, fixture);
try {
  await job.run({ planId: (await job.preview()).plan.planId, confirm: true });
} finally {
  await job.stop();
}
await writeFile(
  'ci-logs/friend-stats-mcp-server.json',
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
    syntheticAcceptances: fixture.effects.length,
    messages: fixture.messages(),
    liveProvider: false,
  })
);
