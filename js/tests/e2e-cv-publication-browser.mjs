import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyCvSnapshotPublication } from './helpers/e2e-cv-publication.mjs';
import { verifyNativeExportPublication } from './helpers/e2e-cv-publication-exports.mjs';
import { verifyExperiencePublication } from './helpers/e2e-cv-publication-experience.mjs';

await runBrowserScenarios('cv-snapshot-publication', [
  verifyCvSnapshotPublication,
  verifyNativeExportPublication,
  verifyExperiencePublication,
]);
