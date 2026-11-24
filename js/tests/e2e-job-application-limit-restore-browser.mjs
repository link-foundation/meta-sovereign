import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationLimitRestore } from './helpers/e2e-application-limit-wait.mjs';
import { verifyNativeNextRecruiterWait } from './helpers/e2e-application-recruiter-panel.mjs';

await runBrowserScenarios('job-application-limit-restore', [
  verifyNativeApplicationLimitRestore,
  verifyNativeNextRecruiterWait,
]);
