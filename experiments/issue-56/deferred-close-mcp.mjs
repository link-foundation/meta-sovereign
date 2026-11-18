// Lightweight independent settings fixture; native closure has separate proof.
import { createServer } from 'node:http';
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { storedDeferredQuestions } from '../../js/src/jobs/deferred-questions.js';

const store = createMemoryStore();
let browserOpens = 0;
const server = await startServer({
  localUi: true,
  port: 0,
  tls: false,
  store,
  log: null,
  enableHandlers: false,
  enableSync: false,
  telegramAccount: false,
  automations: { scheduler: false },
  vacancies: {
    availability: async () => ({ available: true }),
    openSession: async () => {
      browserOpens++;
      throw new Error('Unexpected browser open');
    },
  },
});
const control = createServer(async (_request, response) => {
  const saved = await storedDeferredQuestions(store);
  response.setHeader('content-type', 'application/json');
  response.end(
    JSON.stringify({
      entries: saved.entries.length,
      browserOpens,
      liveProvider: false,
    })
  );
});
await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve));
console.log(
  JSON.stringify({
    pid: process.pid,
    base: `http://127.0.0.1:${server.port}`,
    control: `http://127.0.0.1:${control.address().port}`,
  })
);
let closing;
const close = () =>
  (closing ??= (async () => {
    await new Promise((resolve) => control.close(resolve));
    await server.close();
    console.log(
      JSON.stringify({
        resourcesClosed: true,
        browserOpens,
        liveProvider: false,
      })
    );
  })());
process.once('SIGTERM', close);
process.once('SIGINT', close);
