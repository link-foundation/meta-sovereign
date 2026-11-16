import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationAnswerApproval } from './helpers/e2e-application-answer-approval.mjs';

await runBrowserScenarios('job-application-answers', [
  verifyNativeApplicationAnswerApproval,
]);
