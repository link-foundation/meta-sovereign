import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyConversationHistory } from './helpers/e2e-conversation-history.mjs';

await runBrowserScenarios('question-history', [verifyConversationHistory]);
