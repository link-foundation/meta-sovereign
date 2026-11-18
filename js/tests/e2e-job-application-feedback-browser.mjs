import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationFeedback } from './helpers/e2e-application-feedback.mjs';

await runBrowserScenarios('job-application-feedback', [
  verifyNativeApplicationFeedback,
]);
