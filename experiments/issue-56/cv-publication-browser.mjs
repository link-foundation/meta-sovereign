import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvSnapshotPublication } from '../../js/tests/helpers/e2e-cv-publication.mjs';

const before = process.argv.includes('--before');
await runBrowserScenarios('cv-snapshot-publication', [
  (browser) =>
    verifyCvSnapshotPublication(browser, {
      before,
      screenshots: 'docs/screenshots/issue-56-cv-publication',
    }),
]);
