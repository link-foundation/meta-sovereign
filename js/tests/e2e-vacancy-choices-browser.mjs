import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVacancyChoices } from './helpers/e2e-vacancy-choices.mjs';

await runBrowserScenarios('vacancy-choices', [verifyVacancyChoices]);
