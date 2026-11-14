import { startReplyCacheFixture } from '../../js/tests/helpers/reply-cache-fixture.mjs';

const fixture = await startReplyCacheFixture({ before: '80e93aa5' });
console.log(JSON.stringify({ url: fixture.url, pid: process.pid }));
process.once('SIGTERM', async () => {
  await fixture.close();
});
