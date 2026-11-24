import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationLimitWait } from '../../js/tests/helpers/e2e-application-limit-wait.mjs';

await runBrowserScenarios('application-limit-wait', [
  (browser) =>
    verifyNativeApplicationLimitWait(browser, {
      screenshots: process.env.APPLICATION_SCREENSHOTS,
      before: process.env.APPLICATION_LIMIT_BEFORE === '1',
    }),
]);
