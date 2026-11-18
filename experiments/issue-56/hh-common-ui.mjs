// Isolated MCP fixture. Only synthetic provider data; no scheduler or account.
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { hhCommonFixture } from './hh-common-fixture.mjs';

const store = createMemoryStore();
await store.put({
  id: 'secret:hh:access-token',
  tokens: ['secret'],
  children: [],
  token: 'fixture-token',
});
const fake = hhCommonFixture();
const server = await startServer({
  store,
  port: 0,
  localUi: true,
  telegramAccount: false,
  enableSync: false,
  enableHandlers: false,
  automations: { scheduler: false },
  pulls: {
    hh: { ...fake, maxRequests: 2 },
    minGapMs: 0,
    intervals: { vk: 0, upwork: 0, peopleperhour: 0 },
  },
  log: null,
});
console.log(`http://127.0.0.1:${server.port}/#/connections`);
try {
  await new Promise((resolve) => {
    process.stdin.once('data', resolve);
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
} finally {
  await server.close();
  process.stdin.pause();
}
