import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvWorkplaceFields } from '../../js/tests/helpers/e2e-cv-workplace-fields.mjs';
const before = process.argv.includes('--before');
await runBrowserScenarios('cv-workplace-fields', [
  (browser) =>
    verifyCvWorkplaceFields(browser, {
      before,
      screenshots: `docs/screenshots/issue-56-cv-workplace-fields/${before ? 'before' : 'after'}`,
    }),
]);
