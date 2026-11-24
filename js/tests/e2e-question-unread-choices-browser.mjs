import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyUnreadBotChoices } from './helpers/e2e-unread-bot-choices.mjs';
import { verifyUnreadWaiting } from './helpers/e2e-unread-waiting.mjs';

await runBrowserScenarios(
  'question-unread-choices',
  [verifyUnreadBotChoices, verifyUnreadWaiting],
  { nativeFocus: true }
);
