// Isolated MCP fixture: synthetic forms, owned review/inspection browsers, no account or scheduler.
import { seedFormAnswers } from './forms-plan-fixture.mjs';
import { chromium } from 'playwright';
import { makeBrowserCommander } from 'browser-commander';
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { startFormsFixture } from './forms-reader-fixture.mjs';

const fixture = await startFormsFixture();
const store = createMemoryStore();
await seedFormAnswers(store);
const browsers = new Set();
const reads = [];
let server;
try {
  server = await startServer({
    store,
    port: 0,
    localUi: true,
    telegramAccount: false,
    enableSync: false,
    enableHandlers: false,
    automations: { scheduler: false },
    forms: {
      availability: async () => ({
        available: true,
        missing: [],
        reason: null,
      }),
      openSession: async (options) => {
        const browser = await chromium.launch({
          headless: true,
          ...(process.env.E2E_EXECUTABLE_PATH
            ? { executablePath: process.env.E2E_EXECUTABLE_PATH }
            : {}),
        });
        browsers.add(browser);
        const page = await browser.newPage();
        const commander = makeBrowserCommander({
          page,
          enableNetworkTracking: false,
          enableNavigationManager: false,
          enableDialogManager: false,
        });
        const read = { slot: options.slot, closed: false, events: [] };
        reads.push(read);
        return {
          page,
          commander,
          policy: { headless: true },
          async close() {
            for (const frame of page.frames()) {
              read.events.push(
                ...(await frame.evaluate(() => globalThis.events ?? []))
              );
            }
            await commander.destroy();
            await browser.close();
            browsers.delete(browser);
            read.closed = true;
          },
        };
      },
    },
    log: null,
  });
  console.log(
    JSON.stringify({
      app: `http://127.0.0.1:${server.port}/#/forms`,
      form: fixture.url,
    })
  );
  await new Promise((resolve) => {
    process.stdin.once('data', resolve);
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
} finally {
  await server?.close();
  for (const browser of browsers) {
    await browser.close();
  }
  await fixture.close();
  console.log(
    JSON.stringify({
      reads,
      submissions: fixture.submits,
      requests: fixture.requests,
    })
  );
  process.stdin.pause();
}
