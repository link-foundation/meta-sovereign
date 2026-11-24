import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationPopup } from '../../js/tests/helpers/e2e-application-popup.mjs';
const popup = (browser) =>
  verifyNativeApplicationPopup(browser, {
    before: process.env.POPUP_BEFORE === '1',
    screenshots: process.env.APPLICATION_SCREENSHOTS,
  });
await runBrowserScenarios('job-application', [popup]);
