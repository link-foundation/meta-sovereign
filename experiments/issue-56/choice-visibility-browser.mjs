import { chromium } from 'playwright';
import { verifyChoiceVisibility } from '../../js/tests/helpers/e2e-choice-visibility.mjs';

const browser = await chromium.launch({
  executablePath:
    process.env.E2E_EXECUTABLE_PATH ?? '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
try {
  console.log(
    JSON.stringify(
      await verifyChoiceVisibility(browser, {
        screenshots: process.env.CHOICE_SCREENSHOTS,
      })
    )
  );
} finally {
  await browser.close();
}
