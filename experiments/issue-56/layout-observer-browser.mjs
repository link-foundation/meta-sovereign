import { chromium, webkit } from 'playwright';
import { verifyLayoutObserver } from '../../js/tests/helpers/e2e-layout-observer.mjs';
const engine = process.env.E2E_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch({
  headless: true,
  ...(engine === chromium
    ? { executablePath: '/opt/google/chrome/chrome' }
    : {}),
});
try {
  await verifyLayoutObserver(browser, {
    screenshots: process.env.LAYOUT_SCREENSHOTS,
  });
} finally {
  await browser.close();
}
