import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVacancies } from './helpers/e2e-vacancies.mjs';
import { verifyVacancyDiscovery } from './helpers/e2e-vacancy-discovery.mjs';
import { verifyVacancySelection } from './helpers/e2e-vacancy-selection.mjs';
import { verifyVacancyMetadataVariants } from './helpers/e2e-vacancy-metadata.mjs';
import { verifySalaryLadder } from './helpers/e2e-salary-ladder.mjs';

await runBrowserScenarios('vacancies', [
  verifyVacancies,
  verifyVacancySelection,
  verifyVacancyDiscovery,
  verifySalaryLadder,
  verifyVacancyMetadataVariants,
]);
