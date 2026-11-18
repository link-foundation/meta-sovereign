// Isolated production UI fixture. No credentials, provider writes or user server.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../js/src/server/index.js';
import { followLinksFixture } from '../../js/tests/helpers/follow-links.mjs';

const { store } = await followLinksFixture();
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-follow-links-ui-'));
const handle = await startServer({
  store,
  storeDir: dir,
  port: 0,
  localUi: true,
  enableSync: false,
  enableHandlers: false,
  automations: { scheduler: false },
});
console.log(JSON.stringify({ origin: `http://127.0.0.1:${handle.port}` }));
try {
  await new Promise((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
    process.stdin.once('data', resolve);
  });
} finally {
  await handle.close();
  await rm(dir, { recursive: true, force: true });
  process.stdin.pause();
}
