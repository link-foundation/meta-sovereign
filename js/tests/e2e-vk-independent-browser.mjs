import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVkIndependent } from './helpers/e2e-vk-independent.mjs';

await runBrowserScenarios('vk-independent', [verifyVkIndependent]);
