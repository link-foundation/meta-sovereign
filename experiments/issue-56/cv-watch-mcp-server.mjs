import { createServer } from 'node:http';
import { startServer } from '../../js/src/server/index.js';
import {
  cvWatchFixture,
  cvWatchRaw,
  cvWatchHash,
  cvWatchAttempt,
} from './cv-watch-fixture.mjs';

// The MCP UI uses a deterministic provider adapter. Native Save DOM and CDP
// attachment are independently exercised by cv-watch-browser and cv-watch-cdp.
const fixture = cvWatchFixture();
const about = 'Independent MCP owner revision\nprivate@example.test';
fixture.exports([
  { hash: cvWatchHash, cv: { ...cvWatchRaw(), about }, sha256: 'b'.repeat(64) },
]);
const control = createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  try {
    if (req.method === 'POST' && req.url === '/save') {
      await fixture.emit('save', { ...cvWatchAttempt(), about });
    }
    res.end(JSON.stringify({ ...fixture.counts(), nativeProvider: false }));
  } catch {
    res.statusCode = 500;
    res.end('{"error":"fixture"}');
  }
});
await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve));
const server = await startServer({
  localUi: true,
  port: 0,
  tls: false,
  store: fixture.store,
  enableHandlers: false,
  enableSync: false,
  telegramAccount: false,
  log: null,
  automations: { scheduler: false },
  vacancies: { ...fixture.options },
});
console.log(
  JSON.stringify({
    pid: process.pid,
    base: `http://127.0.0.1:${server.port}`,
    control: `http://127.0.0.1:${control.address().port}`,
  })
);
let closing;
const close = () =>
  (closing ??= (async () => {
    await new Promise((resolve) => control.close(resolve));
    await server.close();
    await fixture.service.stop();
    console.log(JSON.stringify({ ...fixture.counts(), nativeProvider: false }));
  })());
process.once('SIGTERM', close);
process.once('SIGINT', close);
