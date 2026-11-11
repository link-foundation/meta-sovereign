import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyTextReplyGuards } from './helpers/e2e-text-reply.mjs';

await runBrowserScenarios('question-text-guards', [verifyTextReplyGuards]);
