import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import {
  verifyJobsManualLogin,
  verifyManualLoginAttention,
} from './helpers/e2e-jobs-manual-login.mjs';

await runBrowserScenarios(
  'jobs-manual-login',
  process.env.HH_LOGIN_ATTENTION_ONLY === '1'
    ? [verifyManualLoginAttention]
    : [verifyJobsManualLogin, verifyManualLoginAttention]
);
