import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationPacingGuard } from '../../js/tests/helpers/e2e-application-pacing-guard.mjs';
await runBrowserScenarios('job-application-pacing', [
  verifyNativeApplicationPacingGuard,
]);
