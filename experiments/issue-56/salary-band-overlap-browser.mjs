import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifySalaryBandOverlap } from '../../js/tests/helpers/e2e-salary-band-watch.mjs';

await runBrowserScenarios('salary-band-overlap', [verifySalaryBandOverlap]);
