import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyVacancySelection } from '../../js/tests/helpers/e2e-vacancy-selection.mjs';

await runBrowserScenarios('vacancy-selection', [
  (browser) =>
    verifyVacancySelection(browser, {
      before: process.argv.includes('--before'),
      screenshots:
        process.env.E2E_ARTIFACT_DIR ??
        'docs/screenshots/issue-56-vacancy-selection',
    }),
]);
