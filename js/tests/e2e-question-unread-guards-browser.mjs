import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyUnreadViewGuards } from './helpers/e2e-chat-navigation.mjs';

await runBrowserScenarios('question-unread-guards', [verifyUnreadViewGuards], {
  nativeFocus: true,
});
