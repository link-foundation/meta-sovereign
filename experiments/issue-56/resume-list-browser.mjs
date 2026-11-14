import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyJobResumes } from '../../js/tests/helpers/e2e-job-resumes.mjs';
import { verifyVacancies } from '../../js/tests/helpers/e2e-vacancies.mjs';

const before = process.argv.includes('--before');
await runBrowserScenarios('vacancies', [
  (browser) =>
    verifyJobResumes(browser, {
      before,
      screenshots: `docs/screenshots/issue-56-job-resumes/${before ? 'before' : 'after'}`,
    }),
  ...(process.argv.includes('--with-vacancies') ? [verifyVacancies] : []),
]);
