import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVkConfigured } from './helpers/e2e-vk-configured.mjs';

await runBrowserScenarios('vk-configured', [verifyVkConfigured]);
