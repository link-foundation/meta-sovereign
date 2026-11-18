import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { seedWeightedAnswers } from './question-weighted-fixture.mjs';

const store = createMemoryStore();
await seedWeightedAnswers(store);
const original = JSON.stringify(await store.query());
let sends = 0;
const server = await startServer({
  store,
  storeDir: null,
  port: 0,
  localUi: true,
  fileBackups: false,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: false,
  log: null,
  automations: {
    scheduler: false,
    send: async () => {
      sends++;
      throw new Error('Preview must not send');
    },
  },
});
console.log(
  JSON.stringify({
    base: `http://127.0.0.1:${server.port}`,
    liveProvider: false,
  })
);
let timer;
try {
  await new Promise((resolve) => {
    process.once('SIGTERM', resolve);
    process.stdin.once('data', resolve);
    process.stdin.resume();
    timer = setTimeout(resolve, 180000);
  });
} finally {
  clearTimeout(timer);
  process.stdin.pause();
  const knowledgeUnchanged = original === JSON.stringify(await store.query());
  await server.close();
  console.log(
    JSON.stringify({
      resourcesClosed: true,
      sends,
      knowledgeUnchanged,
      liveProvider: false,
    })
  );
}
