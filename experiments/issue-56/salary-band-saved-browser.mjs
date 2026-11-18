import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifySalaryBandSaved } from '../../js/tests/helpers/e2e-salary-band-saved.mjs';

await runBrowserScenarios('salary-band-saved', [verifySalaryBandSaved]);
