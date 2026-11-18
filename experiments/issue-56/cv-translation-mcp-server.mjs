import { createServer } from 'node:http';
import { startServer } from '../../js/src/server/index.js';
import { cvTranslationFixture } from './cv-translation-fixture.mjs';

// Isolated memory store and bounded synthetic translators. No provider/model calls.
const fixture = cvTranslationFixture();
const app = await startServer({
  localUi: true,
  port: 0,
  tls: false,
  store: fixture.store,
  enableHandlers: false,
  enableSync: false,
  telegramAccount: false,
  log: null,
  automations: { scheduler: false },
  vacancies: {
    availability: async () => ({ available: true }),
    cvTranslation: { adapters: fixture.adapters },
  },
});
const stats = () => ({
  modelCalls: fixture.calls.translate.length,
  drained: fixture.calls.drained,
  resolved: fixture.calls.resolve.length,
  authenticatedProvider: false,
  liveTranslator: false,
});
const control = createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  const mode = req.url?.match(/^\/(ready|fail|wait)$/u)?.[1];
  if (req.method === 'POST' && mode) {
    fixture.modes.fail = mode === 'fail' ? 'haiku' : '';
    fixture.modes.wait = mode === 'wait';
  } else if (req.method !== 'GET' || req.url !== '/') {
    res.statusCode = 404;
  }
  res.end(JSON.stringify(stats()));
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
    await fixture.service.stop();
    console.log(JSON.stringify(stats()));
  })());
process.once('SIGTERM', close);
process.once('SIGINT', close);
