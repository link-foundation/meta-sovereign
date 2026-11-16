// Isolated finite policy fixture. No provider adapters, credentials or sends.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { startServer } from '../../js/src/server/index.js';

const directory = await mkdtemp(join(tmpdir(), 'ms-final-period-'));
const store = createMemoryStore();
await store.put({
  id: 'qa-rule:period',
  question: 'Where do you live?',
  answers: [
    { text: 'Vietnam', count: 4, approved: true, evidence: ['fixture:plain'] },
    {
      text: 'Vietnam.',
      count: 1,
      approved: true,
      evidence: ['fixture:period'],
    },
  ],
});
const server = await startServer({
  store,
  storeDir: directory,
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
  await rm(directory, { recursive: true, force: true });
  process.stdin.pause();
}
