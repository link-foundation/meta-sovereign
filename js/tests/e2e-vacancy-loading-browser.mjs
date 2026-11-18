import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVacancyLoading } from './helpers/e2e-vacancy-loading.mjs';

await runBrowserScenarios('vacancy-loading', [verifyVacancyLoading]);
