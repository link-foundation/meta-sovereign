import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifySalaryLadder } from '../../js/tests/helpers/e2e-salary-ladder.mjs';

await runBrowserScenarios('salary-ladder', [verifySalaryLadder]);
