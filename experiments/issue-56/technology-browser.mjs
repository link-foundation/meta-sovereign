import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyVacancyTechnologies } from '../../js/tests/helpers/e2e-vacancy-technologies.mjs';

const before = process.argv.includes('--before');
await runBrowserScenarios('vacancies', [
  (browser) =>
    verifyVacancyTechnologies(browser, {
      before,
      screenshots: `docs/screenshots/issue-56-technologies/${before ? 'before' : 'after'}`,
    }),
]);
