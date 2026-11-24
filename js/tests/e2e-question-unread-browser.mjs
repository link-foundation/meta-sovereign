import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyChatNavigation } from './helpers/e2e-chat-navigation.mjs';

await runBrowserScenarios('question-unread', [verifyChatNavigation], {
  nativeFocus: true,
});
