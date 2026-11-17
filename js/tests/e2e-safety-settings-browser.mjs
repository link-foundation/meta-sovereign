import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifySafetySettings } from './helpers/e2e-safety-settings.mjs';
import { verifySafetyCooldown } from './helpers/e2e-safety-cooldown.mjs';
import { verifySafetyOptOutPerson } from './helpers/e2e-safety-optout-person.mjs';

await runBrowserScenarios('safety-settings', [
  verifySafetySettings,
  verifySafetyCooldown,
  verifySafetyOptOutPerson,
]);
