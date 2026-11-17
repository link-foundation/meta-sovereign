import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyJobBrowserProfiles } from './helpers/e2e-jobs-browser-profile.mjs';

await runBrowserScenarios('jobs-browser-profile', [verifyJobBrowserProfiles]);
