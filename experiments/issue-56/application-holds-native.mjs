import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationHolds } from '../../js/tests/helpers/e2e-application-holds.mjs';
await runBrowserScenarios('job-application', [verifyNativeApplicationHolds]);
