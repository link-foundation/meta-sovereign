import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { makeBrowserCommander } from 'browser-commander';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { startServer } from '../../js/src/server/index.js';
import {
  seedFormQuestionnaire,
  formQuestionnaireHtml,
} from './form-questionnaire-fixture.mjs';
const store = createMemoryStore();
await seedFormQuestionnaire(store);
let submissions = 0;
const reads = [];
const form = createServer((req, res) => {
  if (req.method !== 'GET') {
    submissions++;
  }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(formQuestionnaireHtml);
});
await new Promise((resolve) => form.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  executablePath: process.env.E2E_EXECUTABLE_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  handleSIGINT: false,
  handleSIGTERM: false,
  args: ['--disable-dev-shm-usage'],
});
let app;
let closing;
const close = () =>
  (closing ??= (async () => {
    try {
      await app?.close();
    } finally {
      await browser.close();
      await new Promise((resolve) => form.close(resolve));
    }
    console.log(
      JSON.stringify({
        resourcesClosed: true,
        reads,
        submissions,
        liveProvider: false,
      })
    );
  })());
process.once('SIGTERM', close);
process.once('SIGINT', close);
try {
  app = await startServer({
    port: 0,
    store,
    localUi: true,
    telegramAccount: false,
    enableSync: false,
    enableHandlers: false,
    automations: { scheduler: false },
    log: null,
    forms: {
      availability: async () => ({
        available: true,
        missing: [],
        reason: null,
      }),
      openSession: async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        const commander = makeBrowserCommander({
          page,
          enableNetworkTracking: false,
          enableNavigationManager: false,
          enableDialogManager: false,
        });
        const record = { closed: false, events: [] };
        reads.push(record);
        return {
          page,
          commander,
          policy: { headless: true },
          async close() {
            record.events = await page.evaluate(() => globalThis.events);
            await commander.destroy();
            await context.close();
            record.closed = true;
          },
        };
      },
    },
  });
  console.log(
    JSON.stringify({
      pid: process.pid,
      base: `http://127.0.0.1:${app.port}`,
      form: `http://127.0.0.1:${form.address().port}/questionnaire`,
      liveProvider: false,
    })
  );
} catch (error) {
  await close();
  throw error;
}
