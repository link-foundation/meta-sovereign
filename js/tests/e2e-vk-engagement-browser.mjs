import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVkEngagement } from './helpers/e2e-vk-engagement.mjs';
import { verifyVkMessageDefaults } from './helpers/e2e-vk-message-defaults.mjs';
import { verifyVkLegacyCatalogs } from './helpers/e2e-vk-legacy-catalogs.mjs';
import { verifyVkReadFailure } from './helpers/e2e-vk-read-failure.mjs';
await runBrowserScenarios('vk-engagement', [
  verifyVkEngagement,
  verifyVkMessageDefaults,
  verifyVkLegacyCatalogs,
  verifyVkReadFailure,
]);
