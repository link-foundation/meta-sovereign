import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationLimits } from './helpers/e2e-application-limits.mjs';
import { verifyNativeApplicationLimitWait } from './helpers/e2e-application-limit-wait.mjs';
import { verifyNativeHhCaptcha } from './helpers/e2e-hh-captcha.mjs';

await runBrowserScenarios('job-application-limits', [
  (browser) => verifyNativeApplicationLimits(browser, { backup: true }),
  verifyNativeApplicationLimitWait,
  verifyNativeHhCaptcha,
]);
