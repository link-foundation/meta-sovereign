import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyCvSnapshotPublication } from './helpers/e2e-cv-publication.mjs';

await runBrowserScenarios('cv-snapshot-publication', [
  verifyCvSnapshotPublication,
]);
