import { chromium } from 'playwright';
import { verifyHhChoices } from '../../js/tests/helpers/e2e-hh-choices.mjs';
const browser = await chromium.launch({
  executablePath:
    process.env.E2E_EXECUTABLE_PATH ?? '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
try {
  console.log(
    JSON.stringify(
      await verifyHhChoices(browser, {
        screenshots: process.env.CHOICE_SCREENSHOTS,
        historyOnly: process.env.HH_HISTORY_ONLY === '1',
        collectFailures: process.env.HH_HISTORY_COLLECT_FAILURES === '1',
      })
    )
  );
} finally {
  await browser.close();
}
