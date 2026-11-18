import { writeFile } from 'node:fs/promises';
import { runnerLogServer } from './runner-log-fixture.mjs';

const fixture = await runnerLogServer();
await writeFile(
  'ci-logs/runner-log-mcp-server.json',
  JSON.stringify({ base: fixture.base })
);
console.log(fixture.base);
try {
  await new Promise((resolve) => {
    const stop = () => {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
      resolve();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
} finally {
  await fixture.close();
}
console.log(JSON.stringify({ resourcesClosed: true, liveProvider: false }));
