import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvWorkplaceExperience } from '../../js/tests/helpers/e2e-cv-workplace-experience.mjs';

await runBrowserScenarios('cv-workplace-experience', [
  verifyCvWorkplaceExperience,
]);
