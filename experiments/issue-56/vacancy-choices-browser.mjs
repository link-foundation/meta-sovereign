import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyVacancyChoices } from '../../js/tests/helpers/e2e-vacancy-choices.mjs';

const before = process.argv.includes('--before');
await runBrowserScenarios('vacancy-choices', [
  (browser) =>
    verifyVacancyChoices(browser, {
      before,
      screenshots: `docs/screenshots/issue-56-vacancy-choices/${before ? 'before' : 'after'}`,
    }),
]);
