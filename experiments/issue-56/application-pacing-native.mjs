import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationPacing } from '../../js/tests/helpers/e2e-application-pacing.mjs';
await runBrowserScenarios('job-application', [verifyNativeApplicationPacing]);
