import { startSnapshotFixture } from '../../js/tests/helpers/browser-storage-fixture.mjs';
const entry = `export * from './js/src/storage/browser-store.js';
export { openCausalBrowserStore } from './js/src/storage/open-browser-store.js';`;
const fixture = await startSnapshotFixture({ before: '5a687049', entry });
console.log(JSON.stringify({ url: fixture.url, pid: process.pid }));
process.once('SIGTERM', () => fixture.close());
process.once('SIGINT', () => fixture.close());
