import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeHhCaptcha } from '../../js/tests/helpers/e2e-hh-captcha.mjs';

await runBrowserScenarios('hh-captcha', [
  (browser) =>
    verifyNativeHhCaptcha(browser, {
      screenshots: process.env.APPLICATION_SCREENSHOTS,
      before: process.env.APPLICATION_HH_CAPTCHA_BEFORE === '1',
    }),
]);
