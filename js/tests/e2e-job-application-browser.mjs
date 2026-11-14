import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import {
  verifyNativeApplication,
  verifyNativeApplicationGuards,
} from './helpers/e2e-job-application.mjs';
await runBrowserScenarios('job-application', [
  verifyNativeApplication,
  verifyNativeApplicationGuards,
]);
