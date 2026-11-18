import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvWorkplaceOpening } from '../../js/tests/helpers/e2e-cv-workplace-open.mjs';
const before = process.argv.includes('--before');
await runBrowserScenarios('cv-workplace-open', [
  (browser) =>
    verifyCvWorkplaceOpening(browser, {
      before,
      screenshots: 'docs/screenshots/issue-56-cv-workplace-open',
    }),
]);
