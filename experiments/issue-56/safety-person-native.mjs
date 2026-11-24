import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifySafetyOptOutPerson } from '../../js/tests/helpers/e2e-safety-optout-person.mjs';

await runBrowserScenarios('safety-person', [verifySafetyOptOutPerson]);
