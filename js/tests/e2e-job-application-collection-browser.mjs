import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationCollection } from './helpers/e2e-application-collection.mjs';
import { verifyNativeVacancyPreview } from './helpers/e2e-application-preview.mjs';

await runBrowserScenarios('job-application-collection', [
  verifyNativeApplicationCollection,
  verifyNativeVacancyPreview,
]);
