import { startBrowserMergeFixture } from '../../js/tests/helpers/browser-merge-fixture.mjs';

const fixture = await startBrowserMergeFixture({ before: '1e902295' });
console.log(JSON.stringify({ url: fixture.url, pid: process.pid }));
process.once('SIGTERM', () => fixture.close());
process.once('SIGINT', () => fixture.close());
