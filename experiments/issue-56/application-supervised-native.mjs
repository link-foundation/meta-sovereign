import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationSupervised } from '../../js/tests/helpers/e2e-application-supervised.mjs';
import { verifyApplicationPanel } from '../../js/tests/helpers/e2e-application-panel.mjs';

const supervised = (browser) =>
  verifyNativeApplicationSupervised(browser, {
    before: process.env.SUPERVISED_BEFORE === '1',
    screenshots: process.env.APPLICATION_SCREENSHOTS,
  });
await runBrowserScenarios(
  'job-application',
  process.argv.includes('--compatibility')
    ? [verifyApplicationPanel, supervised]
    : [supervised]
);
