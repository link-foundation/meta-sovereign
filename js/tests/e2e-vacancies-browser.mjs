import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVacancies } from './helpers/e2e-vacancies.mjs';
import { verifyVacancySelection } from './helpers/e2e-vacancy-selection.mjs';
import { verifyVacancyMetadataVariants } from './helpers/e2e-vacancy-metadata.mjs';

await runBrowserScenarios('vacancies', [
  verifyVacancies,
  verifyVacancySelection,
  verifyVacancyMetadataVariants,
]);
