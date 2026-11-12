import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyCvPreparation } from './helpers/e2e-cv-prepare.mjs';

await runBrowserScenarios('cv-prepare', [verifyCvPreparation]);
