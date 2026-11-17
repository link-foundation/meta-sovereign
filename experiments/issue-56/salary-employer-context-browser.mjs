import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifySalaryEmployerContext } from '../../js/tests/helpers/e2e-salary-employer-context.mjs';

await runBrowserScenarios('salary-employer-context', [
  verifySalaryEmployerContext,
]);
