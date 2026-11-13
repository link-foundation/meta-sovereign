import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVacancyChoices } from './helpers/e2e-vacancy-choices.mjs';
import { verifyChoicePutRollback } from './helpers/e2e-choice-put-rollback.mjs';

await runBrowserScenarios('vacancy-choices', [
  verifyVacancyChoices,
  verifyChoicePutRollback,
]);
