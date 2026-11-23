import { chromium } from 'playwright';
import { linkedinAboutBrowserFixture } from './linkedin-about-browser-fixture.mjs';
import { waitForCvFixtureShutdown } from './cv-fixture-server.mjs';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.E2E_EXECUTABLE_PATH || undefined,
});
let fixture;
try {
  fixture = await linkedinAboutBrowserFixture(browser);
  console.log(JSON.stringify({ planRequestId: fixture.plan.requestId }));
  await waitForCvFixtureShutdown(fixture);
  fixture = null;
} finally {
  try {
    await fixture?.close();
  } finally {
    await browser.close();
  }
}
