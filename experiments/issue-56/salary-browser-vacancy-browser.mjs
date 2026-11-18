import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifySalaryBrowserVacancy } from '../../js/tests/helpers/e2e-salary-browser-vacancy.mjs';

await runBrowserScenarios('salary-browser-vacancy', [
  verifySalaryBrowserVacancy,
]);
