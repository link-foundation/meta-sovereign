import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { seedHhAnswerRevisions } from './hh-history-fixture.mjs';

const store = createMemoryStore();
if (process.env.HH_IMPORT_RECORDING !== '1') {
  await seedHhAnswerRevisions(store);
}
const storeDir = await mkdtemp(join(tmpdir(), 'ms-hh-revisions-ui-'));
let server;
try {
  server = await startServer({
    store,
    storeDir,
    port: 0,
    localUi: true,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    automations: { scheduler: false },
  });
  console.log(JSON.stringify({ origin: `http://127.0.0.1:${server.port}` }));
  await new Promise((resolve) => {
    process.once('SIGTERM', resolve);
    process.once('SIGINT', resolve);
    process.stdin.once('data', resolve);
  });
} finally {
  await server?.close();
  await rm(storeDir, { recursive: true, force: true });
  process.stdin.pause();
  console.log(
    JSON.stringify({
      closed: true,
      proposalCount: (
        await store.query((link) => link.id.startsWith('qa-rule:'))
      ).length,
    })
  );
}
