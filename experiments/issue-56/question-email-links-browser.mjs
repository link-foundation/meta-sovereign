import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyEmailQuestionLinks } from '../../js/tests/helpers/e2e-question-email-links.mjs';

await runBrowserScenarios('question-email-links', [
  (browser) =>
    verifyEmailQuestionLinks(browser, {
      screenshots: 'docs/screenshots/issue-56-question-email-links',
      before: process.argv.includes('--before'),
    }),
]);
