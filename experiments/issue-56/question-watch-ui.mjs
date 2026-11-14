import { chromium } from 'playwright';
import { verifyQuestionBrowserWatch } from '../../js/tests/helpers/e2e-question-browser-watch.mjs';
const before = process.argv.includes('--before');
const browser = await chromium.launch({
  executablePath:
    process.env.E2E_EXECUTABLE_PATH ?? '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
try {
  console.log(
    JSON.stringify(
      await verifyQuestionBrowserWatch(browser, {
        before,
        screenshots: `docs/screenshots/issue-56-question-watch/${before ? 'before' : 'after'}`,
      })
    )
  );
} finally {
  await browser.close();
}
