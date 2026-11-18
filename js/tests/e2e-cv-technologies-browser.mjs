import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyCvTechnologies } from './helpers/e2e-cv-technologies.mjs';

await runBrowserScenarios('cv-technologies', [verifyCvTechnologies]);
