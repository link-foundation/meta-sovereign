import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVkEngagement } from './helpers/e2e-vk-engagement.mjs';
await runBrowserScenarios('vk-engagement', [verifyVkEngagement]);
