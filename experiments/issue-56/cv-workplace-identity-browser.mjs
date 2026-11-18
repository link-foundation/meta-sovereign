import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvWatchWorkplace } from '../../js/tests/helpers/e2e-cv-watch-workplace.mjs';

const before = process.argv.includes('--before');
await runBrowserScenarios('cv-workplace-identity', [
  (browser) =>
    verifyCvWatchWorkplace(browser, {
      before,
      screenshots: `docs/screenshots/issue-56-cv-workplace-identity/${before ? 'before' : 'after'}`,
    }),
]);
