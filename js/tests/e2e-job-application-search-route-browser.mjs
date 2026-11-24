import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationSearchRoute } from './helpers/e2e-application-search-route.mjs';
import { verifyNativeApplicationDeliveredReturn } from './helpers/e2e-application-delivered-return.mjs';
import { verifyNativeApplicationRecruiterPanel } from './helpers/e2e-application-recruiter-panel.mjs';

await runBrowserScenarios('job-application-search-route', [
  verifyNativeApplicationSearchRoute,
  verifyNativeApplicationDeliveredReturn,
  verifyNativeApplicationRecruiterPanel,
]);
