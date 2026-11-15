import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVkOnline } from './helpers/e2e-vk-online.mjs';

await runBrowserScenarios('vk-online', [verifyVkOnline]);
