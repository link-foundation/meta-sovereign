import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyApplicationSalary } from './helpers/e2e-application-salary.mjs';
import { verifyApplicationSalaryBatch } from './helpers/e2e-application-salary-batch.mjs';

await runBrowserScenarios('job-application-salary', [
  verifyApplicationSalary,
  verifyApplicationSalaryBatch,
]);
