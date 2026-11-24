import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifySafetyCooldown } from '../../js/tests/helpers/e2e-safety-cooldown.mjs';

await runBrowserScenarios('safety-cooldown', [verifySafetyCooldown]);
