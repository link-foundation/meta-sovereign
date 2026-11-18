import { startSnapshotFixture } from '../../js/tests/helpers/browser-storage-fixture.mjs';
const fixture = await startSnapshotFixture({ before: 'eefc6f7d' });
console.log(JSON.stringify({ url: fixture.url, pid: process.pid }));
process.once('SIGTERM', () => fixture.close());
process.once('SIGINT', () => fixture.close());
