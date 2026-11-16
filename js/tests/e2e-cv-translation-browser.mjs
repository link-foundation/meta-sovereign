import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyCvTranslation } from './helpers/e2e-cv-translation.mjs';
import { verifyCvExperience } from './helpers/e2e-cv-experience.mjs';

import { verifyCvExperienceDocuments } from './helpers/e2e-cv-experience-documents.mjs';

await runBrowserScenarios('cv-translation', [
  verifyCvTranslation,
  verifyCvExperience,
  verifyCvExperienceDocuments,
]);
