import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyCvPreparation } from './helpers/e2e-cv-prepare.mjs';
import { verifyCvPreparationCancellation } from './helpers/e2e-cv-prepare-cancel.mjs';

await runBrowserScenarios('cv-prepare', [
  verifyCvPreparation,
  verifyCvPreparationCancellation,
]);
