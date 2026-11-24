import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationFeedback } from './helpers/e2e-application-feedback.mjs';
import { verifyNativeApplicationRecruiterExact } from './helpers/e2e-application-recruiter-panel.mjs';

await runBrowserScenarios('job-application-feedback', [
  verifyNativeApplicationFeedback,
  verifyNativeApplicationRecruiterExact,
]);
