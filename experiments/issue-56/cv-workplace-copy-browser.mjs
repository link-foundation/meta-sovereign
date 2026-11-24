import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvWorkplaceCopy } from '../../js/tests/helpers/e2e-cv-workplace-copy.mjs';

await runBrowserScenarios('cv-workplace-copy', [verifyCvWorkplaceCopy]);
