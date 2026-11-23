import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyTemplateRequestGuards } from '../../js/tests/helpers/e2e-question-templates.mjs';

await runBrowserScenarios('question-template-request', [
  (browser) =>
    verifyTemplateRequestGuards(browser, {
      before: process.argv.includes('--before'),
      screenshots: process.env.QUESTION_SCREENSHOT_DIR,
    }),
]);
