import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvSaveWatch } from '../../js/tests/helpers/e2e-cv-save-watch.mjs';
import { verifyCvWatchWorkplace } from '../../js/tests/helpers/e2e-cv-watch-workplace.mjs';

const before = process.argv.includes('--before');
await runBrowserScenarios('cv-save-watch', [
  (browser) =>
    verifyCvSaveWatch(browser, {
      before,
      screenshots: `docs/screenshots/issue-56-cv-save-watch/${before ? 'before' : 'after'}`,
    }),
  ...(!before
    ? [
        (browser) =>
          verifyCvWatchWorkplace(browser, {
            screenshots: 'docs/screenshots/issue-56-cv-save-watch/after',
          }),
      ]
    : []),
]);
