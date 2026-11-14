import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationHolds } from './helpers/e2e-application-holds.mjs';
import { verifyNativeApplicationRetries } from './helpers/e2e-application-retries.mjs';
import { verifyNativeApplicationSupervised } from './helpers/e2e-application-supervised.mjs';
import { verifyNativeApplicationPopup } from './helpers/e2e-application-popup.mjs';
import { verifyNativeApplicationLimits } from './helpers/e2e-application-limits.mjs';

await runBrowserScenarios('job-application-policies', [
  verifyNativeApplicationHolds,
  verifyNativeApplicationRetries,
  verifyNativeApplicationSupervised,
  verifyNativeApplicationPopup,
  verifyNativeApplicationLimits,
]);
