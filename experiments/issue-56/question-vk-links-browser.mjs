import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyVkQuestionLinks } from '../../js/tests/helpers/e2e-question-vk-links.mjs';

await runBrowserScenarios('question-vk-links', [
  (browser) =>
    verifyVkQuestionLinks(browser, {
      screenshots: 'docs/screenshots/issue-56-question-vk-links',
      before: process.argv.includes('--before'),
    }),
]);
