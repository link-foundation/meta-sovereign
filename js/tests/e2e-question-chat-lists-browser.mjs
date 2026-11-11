import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyHhChatList } from './helpers/e2e-hh-chat-list.mjs';
import { verifyHhChatScan } from './helpers/e2e-hh-chat-scan.mjs';
import { verifyHhChatFilter } from './helpers/e2e-hh-chat-filter.mjs';

await runBrowserScenarios('question-chat-lists', [
  verifyHhChatList,
  verifyHhChatScan,
  verifyHhChatFilter,
]);
