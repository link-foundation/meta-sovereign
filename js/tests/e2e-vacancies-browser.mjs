import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVacancies } from './helpers/e2e-vacancies.mjs';
import { verifyVacancyMetadataVariants } from './helpers/e2e-vacancy-metadata.mjs';
import { verifyVacancySearchUrl } from './helpers/e2e-vacancy-search-url.mjs';

await runBrowserScenarios('vacancies', [
  verifyVacancies,
  verifyVacancyMetadataVariants,
  verifyVacancySearchUrl,
]);
