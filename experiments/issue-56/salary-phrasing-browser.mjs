import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifySalaryPhrasing } from '../../js/tests/helpers/e2e-salary-clarification.mjs';

await runBrowserScenarios('salary-phrasing', [verifySalaryPhrasing]);
