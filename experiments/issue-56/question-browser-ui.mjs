import { chromium } from 'playwright';
import { verifyQuestionBrowserControls } from '../../js/tests/helpers/e2e-question-browser-controls.mjs';
const browser = await chromium.launch({
  executablePath:
    process.env.E2E_EXECUTABLE_PATH ?? '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
try {
  console.log(
    JSON.stringify(
      await verifyQuestionBrowserControls(browser, {
        before: process.argv.includes('--before'),
        screenshots: `docs/screenshots/issue-56-question-browser/${process.argv.includes('--before') ? 'before' : 'after'}`,
      })
    )
  );
} finally {
  await browser.close();
}
