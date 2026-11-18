import { chromium } from 'playwright';
import { verifySummaryChoices } from '../../js/tests/helpers/e2e-summary-choice.mjs';
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
      await verifySummaryChoices(browser, {
        before,
        screenshots: `docs/screenshots/issue-56-summary-choice/${before ? 'before' : 'after'}`,
      })
    )
  );
} finally {
  await browser.close();
}
