import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationLanguage } from '../../js/tests/helpers/e2e-application-language.mjs';

await runBrowserScenarios('application-language', [
  (browser) =>
    verifyNativeApplicationLanguage(browser, {
      before: process.env.APPLICATION_LANGUAGE_BEFORE === '1',
      screenshots: process.env.APPLICATION_SCREENSHOTS,
    }),
]);
