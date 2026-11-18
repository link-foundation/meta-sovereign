import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationSearchRoute } from './helpers/e2e-application-search-route.mjs';

await runBrowserScenarios('job-application-search-route', [
  verifyNativeApplicationSearchRoute,
]);
