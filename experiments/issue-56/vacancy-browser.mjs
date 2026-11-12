import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyVacancies } from '../../js/tests/helpers/e2e-vacancies.mjs';

const before = process.argv.includes('--before');
await runBrowserScenarios('vacancies', [
  (browser) =>
    verifyVacancies(browser, {
      before,
      screenshots: `docs/screenshots/issue-56-vacancies/${before ? 'before' : 'after'}`,
    }),
]);
