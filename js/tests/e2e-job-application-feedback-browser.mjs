import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationFeedback } from './helpers/e2e-application-feedback.mjs';
import {
  verifyNativeFirstRecruiterWait,
  verifyNativeNextRecruiterWait,
  verifyNativeApplicationRecruiterExact,
  verifyNativeApplicationRecruiterReuse,
} from './helpers/e2e-application-recruiter-panel.mjs';

await runBrowserScenarios('job-application-feedback', [
  verifyNativeApplicationFeedback,
  verifyNativeApplicationRecruiterExact,
  verifyNativeApplicationRecruiterReuse,
  verifyNativeFirstRecruiterWait,
  verifyNativeNextRecruiterWait,
]);
