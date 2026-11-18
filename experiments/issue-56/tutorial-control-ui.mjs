// Empty, isolated server for independent MCP tutorial-control verification.
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';

const server = await startServer({
  store: createMemoryStore(),
  port: 0,
  localUi: true,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: false,
  automations: { scheduler: false },
  log: null,
});
try {
  console.log(JSON.stringify({ app: `http://127.0.0.1:${server.port}/` }));
  await new Promise((resolve) => {
    process.stdin.once('data', resolve);
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
} finally {
  await server.close();
  process.stdin.pause();
  console.log('Closed isolated tutorial server.');
}
