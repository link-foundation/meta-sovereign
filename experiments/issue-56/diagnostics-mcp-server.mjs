import { writeFile } from 'node:fs/promises';
import { diagnosticServer } from './diagnostics-fixture.mjs';
const fixture = await diagnosticServer();
await fetch(`${fixture.base}/synthetic-activity`);
await writeFile(
  'ci-logs/diagnostics-mcp-server.json',
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
console.log(JSON.stringify({ resourcesClosed: true, liveProvider: false }));
