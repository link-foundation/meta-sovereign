import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvTranslation } from '../../js/tests/helpers/e2e-cv-translation.mjs';

const before = process.argv.includes('--before');
await runBrowserScenarios('cv-translation', [
  (browser) =>
    verifyCvTranslation(browser, {
      before,
      screenshots: `docs/screenshots/issue-56-cv-translation/${before ? 'before' : 'after'}`,
    }),
]);
