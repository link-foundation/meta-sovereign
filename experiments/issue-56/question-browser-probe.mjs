import { chromium } from 'playwright';
import { verifyQuestionBrowserControls } from '../../js/tests/helpers/e2e-question-browser-controls.mjs';

/** One isolated browser, drained on success or failure; no live provider. */
export const questionBrowserProbe = async (options) => {
  const browser = await chromium.launch({
    executablePath:
      process.env.E2E_EXECUTABLE_PATH ?? '/opt/google/chrome/chrome',
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });
  try {
    console.log(
      JSON.stringify(await verifyQuestionBrowserControls(browser, options))
    );
  } finally {
    await browser.close();
  }
};
