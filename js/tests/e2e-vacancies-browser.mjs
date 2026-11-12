import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVacancies } from './helpers/e2e-vacancies.mjs';

await runBrowserScenarios('vacancies', [verifyVacancies]);
