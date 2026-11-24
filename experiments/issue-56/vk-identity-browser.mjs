import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyVkIdentity } from '../../js/tests/helpers/e2e-vk-identity.mjs';
await runBrowserScenarios('vk-identity', [
  (browser) =>
    verifyVkIdentity(browser, {
      before: process.argv.includes('--before'),
      screenshots: 'docs/screenshots/issue-56-vk-identity',
    }),
]);
