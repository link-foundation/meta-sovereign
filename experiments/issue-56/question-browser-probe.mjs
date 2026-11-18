import { chromium } from 'playwright';
import { verifyQuestionBrowserControls } from '../../js/tests/helpers/e2e-question-browser-controls.mjs';

/** One isolated browser, drained on success or failure; no live provider. */
export const questionBrowserProbe = async (
  options,
  verify = verifyQuestionBrowserControls
) => {
  const browser = await chromium.launch({
    executablePath:
      process.env.E2E_EXECUTABLE_PATH ?? '/opt/google/chrome/chrome',
    headless: true,
    args: [
      '--disable-dev-shm-usage',
      '--renderer-process-limit=2',
      '--disable-site-isolation-trials',
    ],
  });
  try {
    console.log(JSON.stringify(await verify(browser, options)));
  } finally {
    await browser.close();
  }
};
