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
            if (new URL(page.url()).pathname === '/custom') {
              read.customFrames = [];
              for (const frame of page.frames()) {
                read.customFrames.push(
                  await frame.evaluate(() =>
                    Object.fromEntries(
                      Array.from(
                        globalThis.document.querySelectorAll('[id][role]')
                      ).map((node) => [
                        node.id,
                        {
                          role: node.getAttribute('role'),
                          checked: node.getAttribute('aria-checked'),
                          value: node.value ?? node.textContent.trim(),
                          selected: Array.from(
                            node.querySelectorAll(
                              '[role="option"][aria-selected="true"]'
                            )
                          ).map((option) => option.getAttribute('data-value')),
                        },
                      ])
                    )
                  )
                );
              }
            }
            if (new URL(page.url()).pathname === '/radio') {
              read.radioFrames = [];
              for (const frame of page.frames()) {
                read.radioFrames.push(
                  await frame.evaluate(() =>
                    Array.from(
                      globalThis.document.querySelectorAll(
                        'input[type="radio"]'
                      )
                    ).map((node) => ({
                      id: node.id,
                      name: node.name,
                      form: node.form?.id ?? '',
                      checked: node.checked,
                    }))
                  )
                );
              }
            }
            if (new URL(page.url()).pathname === '/prefill') {
              read.values = await page.evaluate(() =>
                Object.fromEntries(
                  Array.from(
                    globalThis.document.querySelectorAll(
                      'input,select,textarea'
                    )
                  ).map((node) => [
                    node.name,
                    node.type === 'checkbox' ? node.checked : node.value,
                  ])
                )
              );
            }
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
