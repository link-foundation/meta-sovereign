// Isolated Backup-page fixture for Playwright MCP; no provider accounts.
// Run: node experiments/issue-56/recovery-ui.mjs; send a newline to close.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { makeBackup } from '../../js/src/storage/backup.js';

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-recovery-ui-'));
const store = createMemoryStore();
await store.put({
  id: 'note:recovery-fixture',
  tokens: ['note'],
  text: 'Local recovery fixture — no connected accounts',
});
const archiveDir = path.join(dir, 'archives');
await makeBackup(store, { archiveDir });
const server = await startServer({
  store,
  storeDir: dir,
  archiveDir,
  port: 0,
  localUi: true,
  enableHandlers: false,
  enableSync: false,
  telegramAccount: false,
  automations: { scheduler: false },
});
try {
  console.log(JSON.stringify({ origin: `http://127.0.0.1:${server.port}` }));
  await new Promise((resolve) => {
    process.once('SIGTERM', resolve);
    process.once('SIGINT', resolve);
    process.stdin.once('data', resolve);
  });
} finally {
  await server.close();
  await rm(dir, { recursive: true, force: true });
  process.stdin.pause();
}
