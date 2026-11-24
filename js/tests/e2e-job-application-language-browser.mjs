import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationLanguage } from './helpers/e2e-application-language.mjs';

await runBrowserScenarios('job-application-language', [
  verifyNativeApplicationLanguage,
]);
