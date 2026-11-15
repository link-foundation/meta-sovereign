import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVkContextual } from './helpers/e2e-vk-contextual.mjs';
import { contextualReplyKinds } from '../src/automation/contextual-replies.js';
await runBrowserScenarios(
  'vk-contextual',
  contextualReplyKinds.map(
    (kind) => (browser) => verifyVkContextual(browser, kind)
  )
);
