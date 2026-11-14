import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationLimitRestore } from './helpers/e2e-application-limit-wait.mjs';

await runBrowserScenarios('job-application-limit-restore', [
  verifyNativeApplicationLimitRestore,
]);
