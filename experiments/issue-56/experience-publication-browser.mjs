import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyExperiencePublication } from '../../js/tests/helpers/e2e-cv-publication-experience.mjs';

await runBrowserScenarios('experience-publication', [
  (browser) =>
    verifyExperiencePublication(browser, {
      before: process.argv.includes('--before'),
      screenshots: 'docs/screenshots/issue-56-experience-publication',
    }),
]);
