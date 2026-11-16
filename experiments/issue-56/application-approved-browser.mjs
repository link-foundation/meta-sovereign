import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplication } from '../../js/tests/helpers/e2e-job-application.mjs';

await runBrowserScenarios('application-approved', [verifyNativeApplication]);
