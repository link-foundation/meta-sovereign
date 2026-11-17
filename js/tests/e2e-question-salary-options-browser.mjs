import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifySalaryBandSafety } from './helpers/e2e-salary-band-safety.mjs';
import { verifySalaryBandWatch } from './helpers/e2e-salary-band-watch.mjs';
import { verifySalaryBandSaved } from './helpers/e2e-salary-band-saved.mjs';

await runBrowserScenarios('question-salary-options', [
  verifySalaryBandSafety,
  verifySalaryBandWatch,
  verifySalaryBandSaved,
]);
