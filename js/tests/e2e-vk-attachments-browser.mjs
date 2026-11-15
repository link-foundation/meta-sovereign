import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVkAttachments } from './helpers/e2e-vk-attachments.mjs';

await runBrowserScenarios('vk-attachments', [verifyVkAttachments]);
