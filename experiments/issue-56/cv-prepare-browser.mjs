import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvPreparation } from '../../js/tests/helpers/e2e-cv-prepare.mjs';

const before = process.argv.includes('--before');
await runBrowserScenarios('cv-prepare', [
  (browser) =>
    verifyCvPreparation(browser, {
      before,
      screenshots: `docs/screenshots/issue-56-cv-prepare/${before ? 'before' : 'after'}`,
    }),
]);
