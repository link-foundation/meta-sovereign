import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationDraft } from './helpers/e2e-application-drafts.mjs';
import { verifyNativeApplicationRunModes } from './helpers/e2e-application-run-modes.mjs';
import { verifyNativeApplicationDeferral } from './helpers/e2e-application-deferrals.mjs';
import { verifyNativeApplicationHolds } from './helpers/e2e-application-holds.mjs';
import { verifyApplicationPanel } from './helpers/e2e-application-panel.mjs';
import {
  verifyNativeApplication,
  verifyNativeApplicationGuards,
  verifyNativeApplicationRecovery,
} from './helpers/e2e-job-application.mjs';
await runBrowserScenarios('job-application', [
  verifyNativeApplication,
  verifyNativeApplicationGuards,
  verifyApplicationPanel,
  verifyNativeApplicationRecovery,
  verifyNativeApplicationDraft,
  verifyNativeApplicationRunModes,
  verifyNativeApplicationDeferral,
  verifyNativeApplicationHolds,
]);
