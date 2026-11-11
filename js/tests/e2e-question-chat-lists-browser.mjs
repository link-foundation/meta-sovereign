import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyHhChatList } from './helpers/e2e-hh-chat-list.mjs';
import { verifyHhChatScan } from './helpers/e2e-hh-chat-scan.mjs';

await runBrowserScenarios('question-chat-lists', [
  verifyHhChatList,
  verifyHhChatScan,
]);
