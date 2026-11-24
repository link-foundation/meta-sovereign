import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVacancySelection } from './helpers/e2e-vacancy-selection.mjs';

await runBrowserScenarios('vacancy-selection', [verifyVacancySelection]);
