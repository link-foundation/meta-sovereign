import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyHhAcquisition } from '../../js/tests/helpers/e2e-cv-hh-acquisition.mjs';

await runBrowserScenarios('hh-acquisition', [
  (browser) =>
    verifyHhAcquisition(browser, {
      before: process.argv.includes('--before'),
      screenshots: 'docs/screenshots/issue-56-hh-acquisition',
    }),
]);
