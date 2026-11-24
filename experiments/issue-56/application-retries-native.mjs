import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationRetries } from '../../js/tests/helpers/e2e-application-retries.mjs';
await runBrowserScenarios('job-application', [verifyNativeApplicationRetries]);
