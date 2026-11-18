import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyHiddenQuestionLinks } from '../../js/tests/helpers/e2e-question-hidden-links.mjs';

await runBrowserScenarios('question-hidden-links', [
  (browser) =>
    verifyHiddenQuestionLinks(browser, {
      screenshots: 'docs/screenshots/issue-56-question-hidden-links',
      before: process.argv.includes('--before'),
    }),
]);
