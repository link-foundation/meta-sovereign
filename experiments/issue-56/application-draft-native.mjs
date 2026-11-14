import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationDraft } from '../../js/tests/helpers/e2e-application-drafts.mjs';
await runBrowserScenarios('job-application', [verifyNativeApplicationDraft]);
