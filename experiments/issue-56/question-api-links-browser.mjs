import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyApiQuestionLinks } from '../../js/tests/helpers/e2e-question-api-links.mjs';

await runBrowserScenarios('question-api-links', [
  (browser) =>
    verifyApiQuestionLinks(browser, {
      screenshots: 'docs/screenshots/issue-56-question-api-links',
      before: process.argv.includes('--before'),
    }),
]);
