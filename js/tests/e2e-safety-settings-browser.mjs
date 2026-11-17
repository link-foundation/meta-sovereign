import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifySafetySettings } from './helpers/e2e-safety-settings.mjs';

await runBrowserScenarios('safety-settings', [verifySafetySettings]);
