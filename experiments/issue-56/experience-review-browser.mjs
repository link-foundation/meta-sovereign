import { verifyCvExperienceReview } from '../../js/tests/helpers/e2e-cv-experience-review.mjs';
import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';

await runBrowserScenarios('experience-review', [verifyCvExperienceReview]);
