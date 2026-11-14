import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationDraft } from './helpers/e2e-application-drafts.mjs';
import { verifyNativeApplicationRunModes } from './helpers/e2e-application-run-modes.mjs';
import { verifyNativeApplicationDeferral } from './helpers/e2e-application-deferrals.mjs';
import { verifyNativeApplicationResume } from './helpers/e2e-application-resume.mjs';

await runBrowserScenarios('job-application-drafts', [
  verifyNativeApplicationDraft,
  verifyNativeApplicationRunModes,
  verifyNativeApplicationDeferral,
  verifyNativeApplicationResume,
]);
