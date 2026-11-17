import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifySalaryBandSafety } from './helpers/e2e-salary-band-safety.mjs';

await runBrowserScenarios('question-salary-options', [verifySalaryBandSafety]);
