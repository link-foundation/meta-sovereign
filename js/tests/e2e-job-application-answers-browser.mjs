import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationAnswerApproval } from './helpers/e2e-application-answer-approval.mjs';
import { verifyNativeApplicationAnswerContext } from './helpers/e2e-application-answer-context.mjs';
import { verifyApplicationSalary } from './helpers/e2e-application-salary.mjs';
import { verifyApplicationSalaryBatch } from './helpers/e2e-application-salary-batch.mjs';

await runBrowserScenarios('job-application-answers', [
  verifyNativeApplicationAnswerApproval,
  verifyNativeApplicationAnswerContext,
  verifyApplicationSalary,
  verifyApplicationSalaryBatch,
]);
