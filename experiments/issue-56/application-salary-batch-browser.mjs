import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyApplicationSalaryBatch } from '../../js/tests/helpers/e2e-application-salary-batch.mjs';

await runBrowserScenarios('application-salary-batch', [
  verifyApplicationSalaryBatch,
]);
