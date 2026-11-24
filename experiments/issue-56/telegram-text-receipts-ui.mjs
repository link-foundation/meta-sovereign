// Isolated real server for independent Playwright MCP receipt verification.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../js/src/server/index.js';
import { textReceiptFixture } from '../../js/tests/helpers/telegram-text-receipts.mjs';

const f = await textReceiptFixture();
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-text-receipts-ui-'));
const handle = await startServer({
  store: f.store,
  storeDir: dir,
  port: 0,
  localUi: true,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: {
    status: async () => ({
      connected: true,
      kind: 'user',
      account: { username: 'owner' },
      capabilities: {},
    }),
    history: async () => ({ written: 0, cached: true, complete: true }),
    dialogState: async ({ chat }) => ({
      ok: true,
      read: await f.store.get(`read:telegram:${chat}`),
    }),
  },
  automations: { scheduler: false, send: f.send },
});
console.log(JSON.stringify({ origin: `http://127.0.0.1:${handle.port}` }));
try {
  await new Promise((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
    process.stdin.once('data', resolve);
  });
} finally {
  console.log(JSON.stringify({ rpcCalls: f.calls.length, logs: f.logs }));
  await handle.close();
  await rm(dir, { recursive: true, force: true });
  process.stdin.pause();
}
