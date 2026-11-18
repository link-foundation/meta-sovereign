import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationFeedback } from './helpers/e2e-application-feedback.mjs';
import { verifyNativeApplicationCollection } from './helpers/e2e-application-collection.mjs';

await runBrowserScenarios('job-application-feedback', [
  verifyNativeApplicationFeedback,
  verifyNativeApplicationCollection,
]);
