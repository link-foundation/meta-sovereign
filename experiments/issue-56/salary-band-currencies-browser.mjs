import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifySalaryBandCurrencies } from '../../js/tests/helpers/e2e-salary-band-currencies.mjs';

await runBrowserScenarios('salary-band-currencies', [
  verifySalaryBandCurrencies,
]);
