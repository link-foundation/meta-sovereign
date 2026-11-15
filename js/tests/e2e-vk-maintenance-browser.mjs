import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVkMaintenance } from './helpers/e2e-vk-maintenance.mjs';
await runBrowserScenarios('vk-maintenance', [verifyVkMaintenance]);
