import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyTemplateLinkGuards } from '../../js/tests/helpers/e2e-question-templates.mjs';

await runBrowserScenarios('question-template-links', [
  (browser) =>
    verifyTemplateLinkGuards(browser, {
      screenshots: 'docs/screenshots/issue-56-template-link-guards',
      before: process.argv.includes('--before'),
    }),
]);
