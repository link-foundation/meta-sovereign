import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyDesktopLanding } from '../../js/tests/helpers/e2e-desktop-landing.mjs';

await runBrowserScenarios('desktop-landing-availability', [
  (browser) =>
    verifyDesktopLanding(browser, {
      before: process.argv.includes('--before'),
      screenshots: 'docs/screenshots/issue-56-desktop-landing',
    }),
]);
