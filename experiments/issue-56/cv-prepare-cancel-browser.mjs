import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvPreparationCancellation } from '../../js/tests/helpers/e2e-cv-prepare-cancel.mjs';

const before = process.argv.includes('--before');
await runBrowserScenarios('cv-prepare-cancel', [
  (browser) =>
    verifyCvPreparationCancellation(browser, {
      before,
      screenshots: `docs/screenshots/issue-56-cv-prepare-cancel/${before ? 'before' : 'after'}`,
    }),
]);
