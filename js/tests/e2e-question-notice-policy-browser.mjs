import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNoticePolicies } from './helpers/e2e-notice-policy.mjs';
import { verifyNoticePolicyControls } from './helpers/e2e-notice-policy-controls.mjs';
import { verifyNoticePolicyScopes } from './helpers/e2e-notice-policy-scopes.mjs';
await runBrowserScenarios(
  'question-notice-policy',
  [verifyNoticePolicies, verifyNoticePolicyControls, verifyNoticePolicyScopes],
  { nativeFocus: true }
);
