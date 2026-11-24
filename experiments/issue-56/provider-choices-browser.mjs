import { chromium } from 'playwright';
import { verifyProviderChoices } from '../../js/tests/helpers/e2e-provider-choices.mjs';

const browser = await chromium.launch({
  executablePath:
    process.env.E2E_EXECUTABLE_PATH ?? '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
try {
  console.log(
    JSON.stringify(
      await verifyProviderChoices(browser, {
        screenshots: process.env.CHOICE_SCREENSHOTS,
      })
    )
  );
} finally {
  await browser.close();
}
