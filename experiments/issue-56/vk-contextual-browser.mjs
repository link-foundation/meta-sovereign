import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyVkContextual } from '../../js/tests/helpers/e2e-vk-contextual.mjs';
import { contextualReplyKinds } from '../../js/src/automation/contextual-replies.js';
await runBrowserScenarios(
  'vk-contextual-evidence',
  contextualReplyKinds.map(
    (kind) => (browser) =>
      verifyVkContextual(browser, kind, {
        before: process.argv.includes('--before'),
        screenshots: `docs/screenshots/issue-56-vk-${kind}`,
      })
  )
);
