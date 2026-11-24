import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifySalaryChoiceCurrency } from '../../js/tests/helpers/e2e-salary-band-watch.mjs';

await runBrowserScenarios('salary-choice-currency', [
  verifySalaryChoiceCurrency,
]);
