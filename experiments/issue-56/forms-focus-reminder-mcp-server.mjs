import { createInterface } from 'node:readline';
import { chromium } from 'playwright';
import { makeBrowserCommander } from 'browser-commander';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { startServer } from '../../js/src/server/index.js';
import { startFormsFixture } from './forms-reader-fixture.mjs';
import { seedFormAnswers } from './forms-plan-fixture.mjs';

const store = createMemoryStore();
await seedFormAnswers(store);
const fixture = await startFormsFixture();
let browser;
let app;
let owner;
let focuses = 0;
let verification;
const terminal = createInterface({ input: process.stdin });
let closing;
const close = () =>
  (closing ??= (async () => {
    try {
      await app?.close();
    } finally {
      terminal.close();
      await browser?.close();
      await fixture.close();
    }
    console.log(
      JSON.stringify({
        focuses,
        verification,
        submits: fixture.submits,
        closed: true,
      })
    );
  })());
process.once('SIGTERM', close);
process.once('SIGINT', close);

try {
  browser = await chromium.launch({
    executablePath: process.env.E2E_EXECUTABLE_PATH ?? '/usr/bin/google-chrome',
    headless: true,
    handleSIGINT: false,
    handleSIGTERM: false,
    args: ['--disable-dev-shm-usage'],
  });
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
        owner = page;
        const bringToFront = page.bringToFront.bind(page);
        page.bringToFront = async () => {
          await bringToFront();
          focuses++;
        };
        const commander = makeBrowserCommander({
          page,
          enableNetworkTracking: false,
          enableNavigationManager: false,
          enableDialogManager: false,
        });
        return {
          page,
          commander,
          // Exercise the visible-window capability with a headless fixture.
          policy: { headless: false },
          async close() {
            verification = await page.evaluate(() => ({
              releases: globalThis.ownerReleases,
              challengeReads: globalThis.challengeReads,
              events: globalThis.events,
            }));
            await commander.destroy();
            await context.close();
          },
        };
      },
    },
  });
  console.log(
    JSON.stringify({
      base: `http://127.0.0.1:${app.port}`,
      form: fixture.url.replace('/application', '/captcha'),
    })
  );
  for await (const command of terminal) {
    if (command.trim() === 'release') {
      await owner.locator('#owner-clear').click();
      console.log(JSON.stringify({ released: true }));
    }
    if (command.trim() === 'quit') {
      break;
    }
  }
} finally {
  await close();
}
