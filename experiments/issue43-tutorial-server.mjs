// Isolated empty tutorial fixture for Playwright MCP; never uses the user's server.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../js/src/server/index.js';

const storeDir = await mkdtemp(path.join(os.tmpdir(), 'issue43-tutorial-'));
const server = await startServer({
  localUi: true,
  port: 0,
  storeDir,
  enableSync: false,
});
console.log(`http://127.0.0.1:${server.port}/`);
const close = async () => {
  await server.close();
  await rm(storeDir, { recursive: true, force: true });
};
process.once('SIGTERM', close);
process.once('SIGINT', close);
