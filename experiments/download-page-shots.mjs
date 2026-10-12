// PR #34 review: shoot the desktop download page at desktop and phone
// widths, light and dark, and list console errors and overflow.
//   (cd js/src/web && python3 -m http.server 4801) &
//   node ../experiments/download-page-shots.mjs http://localhost:4801/download/ /tmp/dl
import { chromium } from 'playwright';
import fs from 'node:fs';

const [url = 'http://localhost:4801/download/', out = '/tmp/dl'] =
  process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const [name, width, height] of [
  ['desktop', 1280, 800],
  ['phone', 390, 844],
]) {
  for (const scheme of ['light', 'dark']) {
    const page = await browser.newPage({
      viewport: { width, height },
      colorScheme: scheme,
    });
    page.on('console', (m) => {
      if (m.type() === 'error') {
        console.log(`[${name}/${scheme}] console: ${m.text()}`);
      }
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    if (overflow > 0) {
      console.log(`[${name}/${scheme}] overflow ${overflow}px`);
    }
    await page.screenshot({
      path: `${out}/${name}-${scheme}.png`,
      fullPage: true,
    });
    await page.close();
  }
}
await browser.close();
