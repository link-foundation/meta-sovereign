import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyVkGratitude } from '../../js/tests/helpers/e2e-vk-gratitude.mjs';
await runBrowserScenarios('vk-gratitude', [
  (browser) =>
    verifyVkGratitude(browser, {
      before: process.argv.includes('--before'),
      screenshots: 'docs/screenshots/issue-56-vk-gratitude',
    }),
]);
