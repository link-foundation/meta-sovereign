import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { verifyHhImportRead } from '../../js/tests/helpers/e2e-hh-import-read.mjs';

const browser = await chromium.launch({
  executablePath: process.env.E2E_EXECUTABLE_PATH,
});
try {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 800 },
  });
  const errors = [];
  context.on('page', (page) => {
    page.on('pageerror', (error) => errors.push(error.message));
  });
  await verifyHhImportRead(await context.newPage());
  assert.deepEqual(errors, []);
  console.log('Native HeadHunter Chat and CLI receive guarded send receipts');
} finally {
  await browser.close();
}
