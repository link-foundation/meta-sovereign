import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationFeedback } from '../../js/tests/helpers/e2e-application-feedback.mjs';
await runBrowserScenarios('application-feedback', [
  (browser) =>
    verifyNativeApplicationFeedback(browser, {
      before: process.env.APPLICATION_FEEDBACK_BEFORE === '1',
      screenshots: process.env.APPLICATION_SCREENSHOTS,
    }),
]);
