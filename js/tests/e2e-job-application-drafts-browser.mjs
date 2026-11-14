import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationDraft } from './helpers/e2e-application-drafts.mjs';
import { verifyNativeApplicationRunModes } from './helpers/e2e-application-run-modes.mjs';
import { verifyNativeApplicationDeferral } from './helpers/e2e-application-deferrals.mjs';

await runBrowserScenarios('job-application-drafts', [
  verifyNativeApplicationDraft,
  verifyNativeApplicationRunModes,
  verifyNativeApplicationDeferral,
]);
