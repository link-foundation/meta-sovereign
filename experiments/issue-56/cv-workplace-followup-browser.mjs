import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvWorkplaceFollowup } from '../../js/tests/helpers/e2e-cv-workplace-followup.mjs';

const before = process.argv.includes('--before');
const screenshotsAt = process.argv.indexOf('--screenshots');
const screenshots =
  screenshotsAt > 0 ? process.argv[screenshotsAt + 1] : undefined;
await runBrowserScenarios('cv-workplace-followup', [
  (browser) => verifyCvWorkplaceFollowup(browser, { before, screenshots }),
]);
