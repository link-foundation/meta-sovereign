import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeVacancySkips } from './helpers/e2e-vacancy-skips.mjs';

await runBrowserScenarios('job-application-vacancy-skips', [
  verifyNativeVacancySkips,
]);
