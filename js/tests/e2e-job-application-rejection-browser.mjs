import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationLimitRejection } from './helpers/e2e-application-limit-rejection.mjs';
import { verifyNativeFirstRecruiterWait } from './helpers/e2e-application-recruiter-panel.mjs';

await runBrowserScenarios('job-application-rejection', [
  verifyNativeApplicationLimitRejection,
  verifyNativeFirstRecruiterWait,
]);
