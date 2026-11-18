import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVacancyLoading } from './helpers/e2e-vacancy-loading.mjs';
import { verifyVacancyModern } from './helpers/e2e-vacancy-modern.mjs';

await runBrowserScenarios('vacancy-loading', [
  verifyVacancyLoading,
  verifyVacancyModern,
]);
