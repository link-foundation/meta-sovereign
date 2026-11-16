import { browserOf } from '../../js/tests/helpers/e2e-chat.mjs';
import { startSnapshotFixture } from '../../js/tests/helpers/browser-storage-fixture.mjs';
import { checkBrowserBootQueue } from '../../js/tests/helpers/e2e-browser-boot.mjs';

const before = process.argv.includes('--before')
  ? '060b17210d84275ebd7e8bfb65d60aefe7c1a77e'
  : undefined;
const { browserType } = await browserOf('browser-boot');
const fixture = await startSnapshotFixture({
  before,
  entry: `export * from './js/src/storage/browser-store.js';
    export { openCausalBrowserStore } from './js/src/storage/open-browser-store.js';`,
});
let browser;
try {
  browser = await browserType.launch({
    headless: true,
    ...(process.env.E2E_EXECUTABLE_PATH
      ? { executablePath: process.env.E2E_EXECUTABLE_PATH }
      : {}),
  });
  const context = await browser.newContext();
  const pages = [await context.newPage(), await context.newPage()];
  for (const page of pages) {
    page.on('console', (message) => console.log(message.text()));
    await page.goto(fixture.url);
  }
  let error;
  try {
    await checkBrowserBootQueue(pages, before ? 'before' : 'after');
  } catch (failure) {
    error = failure.message;
  }
  if (Boolean(error) !== Boolean(before)) {
    throw new Error(error || 'The exact parent unexpectedly queued its boot');
  }
  if (before && !error.includes('Another tab is saving data')) {
    throw new Error(`The parent failed for an unrelated reason: ${error}`);
  }
  await context.close();
  console.log(
    JSON.stringify({ parent: before, regressionFails: Boolean(error), error })
  );
} finally {
  try {
    await browser?.close();
  } finally {
    await fixture.close();
  }
}
