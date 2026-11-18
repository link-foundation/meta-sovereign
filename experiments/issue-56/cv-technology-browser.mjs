import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvTechnologies } from '../../js/tests/helpers/e2e-cv-technologies.mjs';

const before = process.argv.includes('--before');
await runBrowserScenarios('cv-technologies', [
  (browser) =>
    verifyCvTechnologies(browser, {
      before,
      screenshots: `docs/screenshots/issue-56-cv-technologies/${before ? 'before' : 'after'}`,
    }),
]);
