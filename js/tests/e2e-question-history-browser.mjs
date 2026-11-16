import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyConversationHistory } from './helpers/e2e-conversation-history.mjs';
import { verifyBrowserHistoryArchive } from './helpers/e2e-browser-history-archive.mjs';

await runBrowserScenarios('question-history', [
  verifyConversationHistory,
  verifyBrowserHistoryArchive,
]);
