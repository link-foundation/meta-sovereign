import { createMemoryStore } from '../../js/src/storage/universal.js';
import { saveAnswerRule } from '../../js/src/automation/question-store.js';
import { startServer } from '../../js/src/server/index.js';
import { existingQuestionnaire } from './questionnaire-index-fixture.mjs';

const store = createMemoryStore();
await saveAnswerRule(store, existingQuestionnaire);
const app = await startServer({
  port: 0,
  store,
  localUi: true,
  telegramAccount: false,
  enableSync: false,
  enableHandlers: false,
  automations: { scheduler: false },
  log: null,
});
let closing;
const close = () =>
  (closing ??= (async () => {
    await app.close();
    console.log(JSON.stringify({ resourcesClosed: true, liveProvider: false }));
  })());
process.once('SIGTERM', close);
process.once('SIGINT', close);
console.log(
  JSON.stringify({
    pid: process.pid,
    base: `http://127.0.0.1:${app.port}`,
    liveProvider: false,
  })
);
