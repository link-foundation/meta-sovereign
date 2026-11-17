import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyApplicationSalary } from '../../js/tests/helpers/e2e-application-salary.mjs';

await runBrowserScenarios('application-salary', [verifyApplicationSalary]);
