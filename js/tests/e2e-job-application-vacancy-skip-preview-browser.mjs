import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeVacancySkipPreview } from './helpers/e2e-vacancy-skip-preview.mjs';

await runBrowserScenarios('job-application-vacancy-skip-preview', [
  verifyNativeVacancySkipPreview,
]);
