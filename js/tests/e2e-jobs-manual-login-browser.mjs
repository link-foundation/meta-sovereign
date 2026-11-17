import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyJobsManualLogin } from './helpers/e2e-jobs-manual-login.mjs';

await runBrowserScenarios('jobs-manual-login', [verifyJobsManualLogin]);
