import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyCvTranslation } from './helpers/e2e-cv-translation.mjs';

await runBrowserScenarios('cv-translation', [verifyCvTranslation]);
