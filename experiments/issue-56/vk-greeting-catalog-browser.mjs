import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyVkGreetingCatalog } from '../../js/tests/helpers/e2e-vk-greeting-catalog.mjs';
await runBrowserScenarios('vk-greeting-catalog', [
  (browser) =>
    verifyVkGreetingCatalog(browser, {
      before: process.argv.includes('--before'),
      screenshots: 'docs/screenshots/issue-56-vk-greeting-catalog',
    }),
]);
