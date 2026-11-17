import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import {
  verifySalaryBrowserContext,
  verifySalaryContextGuard,
} from '../../js/tests/helpers/e2e-salary-browser-context.mjs';

await runBrowserScenarios('salary-browser-context', [
  process.env.SALARY_CONTEXT_GUARD_ONLY === '1'
    ? verifySalaryContextGuard
    : verifySalaryBrowserContext,
]);
