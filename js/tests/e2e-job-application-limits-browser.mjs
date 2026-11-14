import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationLimits } from './helpers/e2e-application-limits.mjs';

await runBrowserScenarios('job-application-limits', [
  (browser) => verifyNativeApplicationLimits(browser, { backup: true }),
]);
