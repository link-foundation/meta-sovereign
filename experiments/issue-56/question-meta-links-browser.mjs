import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyMetaQuestionLinks } from '../../js/tests/helpers/e2e-question-meta-links.mjs';

await runBrowserScenarios('question-meta-links', [
  (browser) =>
    verifyMetaQuestionLinks(browser, {
      screenshots: 'docs/screenshots/issue-56-question-meta-links',
      before: process.argv.includes('--before'),
    }),
]);
