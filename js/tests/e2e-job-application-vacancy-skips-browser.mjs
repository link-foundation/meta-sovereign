import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeVacancySkips } from './helpers/e2e-vacancy-skips.mjs';
import { verifyNativeVacancySkipRetries } from './helpers/e2e-vacancy-skip-retries.mjs';

await runBrowserScenarios('job-application-vacancy-skips', [
  verifyNativeVacancySkips,
  verifyNativeVacancySkipRetries,
]);
