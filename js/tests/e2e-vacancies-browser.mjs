import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVacancies } from './helpers/e2e-vacancies.mjs';
import { verifyVacancyDiscovery } from './helpers/e2e-vacancy-discovery.mjs';
import { verifyVacancySelection } from './helpers/e2e-vacancy-selection.mjs';

await runBrowserScenarios('vacancies', [
  verifyVacancies,
  verifyVacancySelection,
  verifyVacancyDiscovery,
]);
