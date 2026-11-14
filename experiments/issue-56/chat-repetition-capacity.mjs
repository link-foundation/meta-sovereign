import { chromium } from 'playwright';
import assert from 'node:assert/strict';

// One empty local document, 52 finite pushes and one native history inspection.
const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.goto('about:blank');
  await page.evaluate(() => {
    for (let index = 0; index < 52; index++) {
      window.history.pushState(null, '', `#entry-${index}`);
    }
  });
  const session = await page.context().newCDPSession(page);
  try {
    const history = await session.send('Page.getNavigationHistory');
    const length = await page.evaluate(() => window.history.length);
    assert.equal(length, 50);
    assert.equal(history.entries.length, 50);
    assert.equal(history.currentIndex, 49);
    console.log(
      JSON.stringify({
        version: browser.version(),
        pushes: 52,
        domLength: length,
        nativeLength: history.entries.length,
        index: history.currentIndex,
        evicted: true,
      })
    );
  } finally {
    await session.detach();
  }
} finally {
  await browser.close();
}
