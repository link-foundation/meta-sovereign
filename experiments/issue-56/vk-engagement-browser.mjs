import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyVkEngagement } from '../../js/tests/helpers/e2e-vk-engagement.mjs';
await runBrowserScenarios('vk-engagement-evidence', [
  (browser) =>
    verifyVkEngagement(browser, {
      before: process.argv.includes('--before'),
      screenshots: 'docs/screenshots/issue-56-vk-engagement',
    }),
]);
