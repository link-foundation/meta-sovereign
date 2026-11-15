import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyVkGratitude } from '../../js/tests/helpers/e2e-vk-gratitude.mjs';
await runBrowserScenarios('vk-identity-gratitude-compatibility', [
  (browser) => verifyVkGratitude(browser),
]);
