import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationLimitRestore } from '../../js/tests/helpers/e2e-application-limit-wait.mjs';

await runBrowserScenarios('application-limit-restore', [
  (browser) =>
    verifyNativeApplicationLimitRestore(browser, {
      screenshots: process.env.APPLICATION_SCREENSHOTS,
      before: process.env.APPLICATION_LIMIT_BEFORE === '1',
    }),
]);
