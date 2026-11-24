import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvWatchTransitions } from '../../js/tests/helpers/e2e-cv-watch-transitions.mjs';

await runBrowserScenarios('cv-watch-transitions', [
  (browser) =>
    verifyCvWatchTransitions(browser, {
      before: process.argv.includes('--before'),
      screenshots: process.env.CV_TRANSITION_SCREENSHOTS,
    }),
]);
