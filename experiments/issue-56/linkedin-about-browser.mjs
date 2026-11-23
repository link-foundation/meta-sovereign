import { verifyCvLinkedinAbout } from '../../js/tests/helpers/e2e-cv-linkedin-about.mjs';
import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';

await runBrowserScenarios('linkedin-about', [verifyCvLinkedinAbout]);
