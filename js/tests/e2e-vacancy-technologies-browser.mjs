import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVacancyTechnologies } from './helpers/e2e-vacancy-technologies.mjs';

await runBrowserScenarios('vacancy-technologies', [verifyVacancyTechnologies]);
