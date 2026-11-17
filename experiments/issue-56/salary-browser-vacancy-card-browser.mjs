import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifySalaryBrowserVacancyCard } from '../../js/tests/helpers/e2e-salary-browser-vacancy-card.mjs';

await runBrowserScenarios('salary-browser-vacancy-card', [
  verifySalaryBrowserVacancyCard,
]);
