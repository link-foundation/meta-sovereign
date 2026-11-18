import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyVkIdentity } from '../../js/tests/helpers/e2e-vk-identity.mjs';
await runBrowserScenarios('vk-acquaintance-identity-compatibility', [
  verifyVkIdentity,
]);
