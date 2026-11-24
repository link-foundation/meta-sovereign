import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvWorkplaceFields } from '../../js/tests/helpers/e2e-cv-workplace-fields.mjs';

await runBrowserScenarios('workplace-review-trace', [verifyCvWorkplaceFields]);
