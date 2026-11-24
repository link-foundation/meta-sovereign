import { createServer } from 'node:http';
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';

// Isolated app and store; never attach to the owner's running server.
const store = createMemoryStore();
const app = await startServer({
  localUi: true,
  port: 0,
  tls: false,
  store,
  enableHandlers: false,
  enableSync: true,
  telegramAccount: false,
  log: null,
  automations: { scheduler: false },
});
const stats = async () => ({
  serverApplicationRecords: (
    await store.query((link) => link.id.startsWith('l:mcp-mesh-'))
  ).length,
});
const control = createServer(async (_req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(await stats()));
});
await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve));
console.log(
  JSON.stringify({
    pid: process.pid,
    base: `http://127.0.0.1:${app.port}`,
    control: `http://127.0.0.1:${control.address().port}`,
  })
);
let closing;
const close = () =>
  (closing ??= (async () => {
    await new Promise((resolve) => control.close(resolve));
    await app.close();
    console.log(JSON.stringify(await stats()));
  })());
process.once('SIGTERM', close);
process.once('SIGINT', close);
