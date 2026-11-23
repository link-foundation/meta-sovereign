import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvLinkedinPositionReview } from '../../js/tests/helpers/e2e-cv-linkedin-experience.mjs';

await runBrowserScenarios('linkedin-position-review', [
  verifyCvLinkedinPositionReview,
]);
