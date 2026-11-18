import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvExperience } from '../../js/tests/helpers/e2e-cv-experience.mjs';

await runBrowserScenarios('cv-loading-focused', [verifyCvExperience]);
