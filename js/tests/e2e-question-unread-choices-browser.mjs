import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyUnreadBotChoices } from './helpers/e2e-unread-bot-choices.mjs';

await runBrowserScenarios('question-unread-choices', [verifyUnreadBotChoices], {
  nativeFocus: true,
});
