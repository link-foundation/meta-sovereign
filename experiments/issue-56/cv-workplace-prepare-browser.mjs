import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvWorkplacePreparation } from '../../js/tests/helpers/e2e-cv-workplace-prepare.mjs';
const before = process.argv.includes('--before');
await runBrowserScenarios('cv-workplace-prepare', [
  (browser) =>
    verifyCvWorkplacePreparation(browser, {
      before,
      screenshots: `docs/screenshots/issue-56-cv-workplace-prepare/${before ? 'before' : 'after'}`,
    }),
]);
