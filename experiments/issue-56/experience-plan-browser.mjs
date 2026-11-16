import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvExperiencePlans } from '../../js/tests/helpers/e2e-cv-experience-plan.mjs';

await runBrowserScenarios('experience-plan-focused', [verifyCvExperiencePlans]);
