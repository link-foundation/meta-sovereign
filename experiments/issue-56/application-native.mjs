import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import {
  verifyNativeApplication,
  verifyNativeApplicationGuards,
} from '../../js/tests/helpers/e2e-job-application.mjs';
await runBrowserScenarios('job-application', [
  verifyNativeApplication,
  verifyNativeApplicationGuards,
]);
