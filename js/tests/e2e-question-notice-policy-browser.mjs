import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNoticePolicies } from './helpers/e2e-notice-policy.mjs';
import { verifyNoticePolicyControls } from './helpers/e2e-notice-policy-controls.mjs';
await runBrowserScenarios(
  'question-notice-policy',
  [verifyNoticePolicies, verifyNoticePolicyControls],
  { nativeFocus: true }
);
