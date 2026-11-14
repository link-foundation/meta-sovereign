import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyQuestionTemplates } from '../../js/tests/helpers/e2e-question-templates.mjs';

await runBrowserScenarios('question-templates', [
  (browser) =>
    verifyQuestionTemplates(browser, {
      screenshots: 'docs/screenshots/issue-56-question-templates',
    }),
]);
