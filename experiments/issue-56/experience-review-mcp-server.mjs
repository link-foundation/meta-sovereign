import { chromium } from 'playwright';
import { cvPrepareBrowserFixture } from './cv-prepare-browser-fixture.mjs';
import { waitForCvFixtureShutdown } from './cv-fixture-server.mjs';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.E2E_EXECUTABLE_PATH || undefined,
});
let fixture;
try {
  fixture = await cvPrepareBrowserFixture(browser, { reviewQueue: true });
  console.log(JSON.stringify({ input: fixture.queue.input }));
  await waitForCvFixtureShutdown(fixture);
  fixture = null;
} finally {
  try {
    await fixture?.close();
  } finally {
    await browser.close();
  }
}
