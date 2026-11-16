import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationAnswerApproval } from './helpers/e2e-application-answer-approval.mjs';
import { verifyNativeApplicationAnswerContext } from './helpers/e2e-application-answer-context.mjs';

await runBrowserScenarios('job-application-answers', [
  verifyNativeApplicationAnswerApproval,
  verifyNativeApplicationAnswerContext,
]);
