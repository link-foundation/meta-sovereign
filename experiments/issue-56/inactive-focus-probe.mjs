// Two empty local tabs per launch; no provider, server or account traffic.
import { chromium } from 'playwright';

const launches = process.argv.slice(2);
for (const kind of launches.length ? launches : ['shell', 'chrome']) {
  const browser = await chromium.launch({
    headless: true,
    ...(kind === 'chrome'
      ? { executablePath: '/opt/google/chrome/chrome' }
      : {}),
    args: ['--disable-dev-shm-usage', '--renderer-process-limit=2'],
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(
      '<title>Original view</title><textarea>owner draft</textarea>'
    );
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setFocusEmulationEnabled', {
      enabled: false,
    });
    await session.detach();
    const snapshot = () =>
      page.evaluate(() => ({
        focused: document.hasFocus(),
        visibility: document.visibilityState,
      }));
    const original = await snapshot();
    const other = await context.newPage();
    await other.bringToFront();
    const background = await snapshot();
    await page.bringToFront();
    const returned = await snapshot();
    console.log(
      JSON.stringify({
        kind,
        version: browser.version(),
        original,
        background,
        returned,
      })
    );
  } finally {
    await browser.close();
  }
}
