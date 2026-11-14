import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyResumeLanguage } from '../../js/tests/helpers/e2e-resume-language.mjs';

await runBrowserScenarios('resume-language', [
  (browser) =>
    verifyResumeLanguage(browser, {
      before: process.env.RESUME_LANGUAGE_BEFORE === '1',
      screenshots: process.env.RESUME_LANGUAGE_SCREENSHOTS,
    }),
]);
