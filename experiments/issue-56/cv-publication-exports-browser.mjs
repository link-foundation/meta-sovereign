import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeExportPublication } from '../../js/tests/helpers/e2e-cv-publication-exports.mjs';

await runBrowserScenarios('cv-native-export-publication', [
  (browser) =>
    verifyNativeExportPublication(browser, {
      before: process.argv.includes('--before'),
      screenshots: 'docs/screenshots/issue-56-cv-publication-exports',
    }),
]);
