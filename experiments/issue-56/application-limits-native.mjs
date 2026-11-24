import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationLimits } from '../../js/tests/helpers/e2e-application-limits.mjs';

await runBrowserScenarios('application-limits', [
  (browser) =>
    verifyNativeApplicationLimits(browser, {
      before: process.env.APPLICATION_LIMIT_BEFORE === '1',
      screenshots: process.env.APPLICATION_SCREENSHOTS,
    }),
]);
