import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { questionnaireMessages } from './question-lists-fixture.mjs';

const store = createMemoryStore();
for (const message of questionnaireMessages()) {
  await store.put(message);
}
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-question-lists-ui-'));
const server = await startServer({
  port: 0,
  store,
  storeDir: dir,
  localUi: true,
  telegramAccount: false,
  enableSync: false,
  enableHandlers: false,
  automations: { scheduler: false },
  log: null,
});
console.log(`http://127.0.0.1:${server.port}/#/automation`);
try {
  await new Promise((resolve) => {
    process.stdin.once('data', resolve);
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
} finally {
  await server.close();
  await rm(dir, { recursive: true, force: true });
  process.stdin.pause();
}
