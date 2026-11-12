import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyCvWorkplacePreparation } from './helpers/e2e-cv-workplace-prepare.mjs';
import { verifyCvPreparation } from './helpers/e2e-cv-prepare.mjs';
import { verifyCvPreparationCancellation } from './helpers/e2e-cv-prepare-cancel.mjs';
import { verifyCvWorkplaceFields } from './helpers/e2e-cv-workplace-fields.mjs';

await runBrowserScenarios('cv-prepare', [
  verifyCvPreparation,
  verifyCvPreparationCancellation,
  verifyCvWorkplacePreparation,
  verifyCvWorkplaceFields,
]);
