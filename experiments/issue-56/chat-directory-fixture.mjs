// Isolated cached directory for the independent MCP keyboard verification.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../js/src/server/index.js';
import { directoryStore } from '../../js/tests/helpers/directory-store.mjs';

const dir = await mkdtemp(join(tmpdir(), 'ms-directory-mcp-'));
let handle;
try {
  handle = await startServer({
    localUi: true,
    port: 0,
    storeDir: dir,
    store: await directoryStore(),
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    log: null,
    automations: { scheduler: false },
  });
} catch (error) {
  await rm(dir, { recursive: true, force: true });
  throw error;
}
console.log(
  JSON.stringify({ pid: process.pid, base: `http://127.0.0.1:${handle.port}` })
);
let closing;
const close = () =>
  (closing ??= (async () => {
    await handle.close();
    await rm(dir, { recursive: true, force: true });
    console.log('Owned directory fixture closed');
  })());
process.once('SIGTERM', close);
process.once('SIGINT', close);
