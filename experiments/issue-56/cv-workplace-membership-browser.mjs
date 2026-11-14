import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvWorkplaceMembership } from '../../js/tests/helpers/e2e-cv-workplace-membership.mjs';
const before = process.argv.includes('--before');
await runBrowserScenarios('cv-workplace-membership', [
  (browser) =>
    verifyCvWorkplaceMembership(browser, {
      before,
      screenshots: `docs/screenshots/issue-56-cv-workplace-membership/${before ? 'before' : 'after'}`,
    }),
]);
