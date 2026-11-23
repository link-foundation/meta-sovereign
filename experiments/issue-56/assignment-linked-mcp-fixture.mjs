import { once } from 'node:events';
import { makeBrowserCommander } from 'browser-commander';
import { chromium } from 'playwright';
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { assignmentPublisherFixture } from './assignment-publisher-fixture.mjs';
import {
  assignmentSourceBrowserFixture,
  withAssignmentSourceModel,
} from './assignment-source-fixture.mjs';
import { seedAssignmentAnswers } from './forms-assignment-fixture.mjs';
import { seedFormAnswers } from './forms-plan-fixture.mjs';
import { startFormsFixture } from './forms-reader-fixture.mjs';

const store = createMemoryStore();
await seedFormAnswers(store);
await seedAssignmentAnswers(store);
const publication = await assignmentPublisherFixture();
const fixture = await startFormsFixture();
const owned = [];
const sources = [];
let browser;
let server;
try {
  browser = await chromium.launch({
    executablePath: process.env.E2E_EXECUTABLE_PATH,
  });
  server = await startServer({
    store,
    port: 0,
    localUi: true,
    log: null,
    enableSync: false,
    enableHandlers: false,
    automations: { scheduler: false },
    answerModel: {
      draft: withAssignmentSourceModel(publication.modelRunner),
      stop: async () => {},
    },
    forms: {
      availability: async () => ({
        available: true,
        missing: [],
        reason: null,
      }),
      assignmentGithub: publication.github,
      readAssignmentSource: assignmentSourceBrowserFixture({
        store,
        browser: () => browser,
        records: sources,
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
        const record = { value: null, closed: false };
        owned.push(record);
        return {
          page,
          commander,
          policy: { headless: true },
          close: async () => {
            record.value = await page.evaluate(
              () =>
                globalThis.document.querySelector('[name="english"]')?.value ??
                null
            );
            await commander.destroy();
            await context.close();
            record.closed = true;
          },
        };
      },
    },
  });
  const url = new URL(`http://127.0.0.1:${server.port}/`);
  url.searchParams.set('fixture', new URL('/assignment-linked', fixture.url));
  console.log(JSON.stringify({ url }));
  process.stdin.resume();
  await once(process.stdin, 'data');
} finally {
  process.stdin.pause();
  await server?.close();
  await browser?.close();
  await fixture.close();
  console.log(
    JSON.stringify({
      forms: owned,
      sources: sources.map(({ closed }) => closed),
      modelCalls: publication.state.modelCalls.length,
      externalWrites: Boolean(
        publication.state.repository || publication.state.issues.length
      ),
      submissions: fixture.submits,
    })
  );
}
