import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVkToken } from './helpers/e2e-vk-token.mjs';
await runBrowserScenarios('vk-token', [verifyVkToken]);
