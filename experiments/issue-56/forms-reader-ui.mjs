// Isolated MCP fixture: synthetic forms, owned review/inspection browsers, no account or scheduler.
import { seedFormAnswers } from './forms-plan-fixture.mjs';
import { chromium } from 'playwright';
import { makeBrowserCommander } from 'browser-commander';
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import {
  startFormsFixture,
  driftFormDocumentClock,
} from './forms-reader-fixture.mjs';
import { controlFormMonitorFixture } from './forms-monitor-control.mjs';
import { saveConfiguredResume } from '../../js/src/forms/configured-resume.js';
import { syntheticResumePdf } from './forms-resume-fixture.mjs';
import {
  seedModelAnswers,
  modelRunnerFixture,
} from './forms-model-fixture.mjs';

const fixture = await startFormsFixture();
const store = createMemoryStore();
await seedFormAnswers(store);
const modelCalls = [];
const modelMode = process.env.FORMS_MODEL_MCP === '1';
if (modelMode) {
  await seedModelAnswers(store);
}
if (process.env.FORMS_RESUME_MCP === '1') {
  await saveConfiguredResume(store, {
    file: {
      name: 'synthetic-resume.pdf',
      data: syntheticResumePdf().toString('base64'),
    },
  });
}
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
    ...(modelMode
      ? {
          answerModel: {
            draft: modelRunnerFixture(modelCalls),
            stop: async () => {},
          },
        }
      : {}),
    forms: {
      review: {
        learning: {
          stableMs: process.env.FORMS_LEARNING_MCP === '1' ? 800 : 60000,
        },
      },
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
        if (process.env.FORMS_DOCUMENT_CLOCK_DRIFT === '1') {
          await page.addInitScript(driftFormDocumentClock);
        }
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
            if (new URL(page.url()).pathname === '/upload') {
              read.uploadFrames = [];
              for (const frame of page.frames()) {
                read.uploadFrames.push(
                  await frame.evaluate(async () => {
                    const fields = {};
                    for (const node of globalThis.document.querySelectorAll(
                      'input[id]'
                    )) {
                      fields[node.id] =
                        node.type === 'file'
                          ? await Promise.all(
                              Array.from(node.files).map(async (file) => ({
                                name: file.name,
                                size: file.size,
                                type: file.type,
                                sha256: Array.from(
                                  new Uint8Array(
                                    await globalThis.crypto.subtle.digest(
                                      'SHA-256',
                                      await file.arrayBuffer()
                                    )
                                  ),
                                  (byte) => byte.toString(16).padStart(2, '0')
                                ).join(''),
                              }))
                            )
                          : node.value;
                    }
                    return fields;
                  })
                );
              }
            }
            if (
              ['/custom', '/choices'].includes(new URL(page.url()).pathname)
            ) {
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
            if (['/prefill', '/model'].includes(new URL(page.url()).pathname)) {
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
      form: modelMode
        ? fixture.url.replace('/application', '/model')
        : process.env.FORMS_RESUME_MCP === '1'
          ? fixture.url.replace('/application', '/upload')
          : process.env.FORMS_LEARNING_MCP === '1'
            ? fixture.url.replace('/application', '/learning')
            : process.env.FORMS_MONITOR_MCP === '1'
              ? fixture.url.replace('/application', '/monitor')
              : fixture.url,
    })
  );
  if (
    process.env.FORMS_MONITOR_MCP === '1' ||
    process.env.FORMS_LEARNING_MCP === '1'
  ) {
    await controlFormMonitorFixture({
      browsers,
      store,
      fixture,
      learning: process.env.FORMS_LEARNING_MCP === '1',
    });
  } else {
    await new Promise((resolve) => {
      process.stdin.once('data', resolve);
      process.once('SIGINT', resolve);
      process.once('SIGTERM', resolve);
    });
  }
} finally {
  await server?.close();
  for (const browser of browsers) {
    await browser.close();
  }
  await fixture.close();
  console.log(
    JSON.stringify({
      reads,
      ...(modelMode ? { modelCalls: modelCalls.length } : {}),
      submissions: fixture.submits,
      requests: fixture.requests,
    })
  );
  process.stdin.pause();
}
