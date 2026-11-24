import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationRunModes } from '../../js/tests/helpers/e2e-application-run-modes.mjs';
await runBrowserScenarios('job-application', [verifyNativeApplicationRunModes]);
