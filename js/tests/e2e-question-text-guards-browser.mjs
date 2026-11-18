import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyTextReplyGuards } from './helpers/e2e-text-reply.mjs';
import { verifyBrowserComposerDraft } from './helpers/e2e-browser-composer-draft.mjs';

await runBrowserScenarios('question-text-guards', [
  verifyTextReplyGuards,
  verifyBrowserComposerDraft,
]);
