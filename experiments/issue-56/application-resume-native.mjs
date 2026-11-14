import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationResume } from '../../js/tests/helpers/e2e-application-resume.mjs';

await runBrowserScenarios('application-resume', [
  (browser) =>
    verifyNativeApplicationResume(browser, {
      before: process.env.APPLICATION_RESUME_BEFORE === '1',
      screenshots: process.env.APPLICATION_SCREENSHOTS,
    }),
]);
