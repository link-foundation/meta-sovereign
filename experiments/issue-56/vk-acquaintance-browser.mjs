import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyVkAcquaintance } from '../../js/tests/helpers/e2e-vk-acquaintance.mjs';
await runBrowserScenarios('vk-acquaintance', [
  (browser) =>
    verifyVkAcquaintance(browser, {
      before: process.argv.includes('--before'),
      screenshots: 'docs/screenshots/issue-56-vk-acquaintance',
    }),
]);
