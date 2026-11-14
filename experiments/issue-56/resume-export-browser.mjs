import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyResumeExports } from '../../js/tests/helpers/e2e-resume-exports.mjs';

const before = process.argv.includes('--before');
await runBrowserScenarios('vacancies', [
  (browser) =>
    verifyResumeExports(browser, {
      before,
      screenshots: `docs/screenshots/issue-56-resume-exports/${before ? 'before' : 'after'}`,
    }),
]);
