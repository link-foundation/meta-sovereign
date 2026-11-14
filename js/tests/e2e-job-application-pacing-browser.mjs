import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationPacing } from './helpers/e2e-application-pacing.mjs';
import { verifyNativeApplicationPacingGuard } from './helpers/e2e-application-pacing-guard.mjs';

await runBrowserScenarios('job-application-pacing', [
  verifyNativeApplicationPacing,
  verifyNativeApplicationPacingGuard,
]);
