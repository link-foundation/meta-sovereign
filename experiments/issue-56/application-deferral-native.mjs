import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationDeferral } from '../../js/tests/helpers/e2e-application-deferrals.mjs';
await runBrowserScenarios('job-application', [verifyNativeApplicationDeferral]);
