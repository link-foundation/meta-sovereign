import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyApplicationPanel } from '../../js/tests/helpers/e2e-application-panel.mjs';

await runBrowserScenarios('job-application', [
  (browser) =>
    verifyApplicationPanel(browser, {
      screenshots: 'docs/screenshots',
      before: process.argv.includes('--before'),
    }),
]);
