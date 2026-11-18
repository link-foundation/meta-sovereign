import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyUnreadRepetition } from './helpers/e2e-chat-navigation.mjs';

await runBrowserScenarios('question-unread-repeat', [verifyUnreadRepetition], {
  nativeFocus: true,
});
