import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvExperienceAuto } from '../../js/tests/helpers/e2e-cv-experience-auto.mjs';

await runBrowserScenarios('experience-auto', [verifyCvExperienceAuto]);
