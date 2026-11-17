import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyApplicationPanel } from './helpers/e2e-application-panel.mjs';
import { verifyApplicationSalary } from './helpers/e2e-application-salary.mjs';
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
  verifyApplicationSalary,
]);
