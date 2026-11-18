import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import {
  verifyNativeResumeVisibility,
  verifyPopupResumeVisibility,
} from './helpers/e2e-application-resume-visibility.mjs';
import { verifyNativeVacancySkips } from './helpers/e2e-vacancy-skips.mjs';

await runBrowserScenarios('job-application-visibility', [
  verifyNativeResumeVisibility,
  verifyPopupResumeVisibility,
  verifyNativeVacancySkips,
]);
