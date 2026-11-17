import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyUnreadAnswers } from '../../js/tests/helpers/e2e-unread-answers.mjs';
import { verifyUnreadBotChoices } from '../../js/tests/helpers/e2e-unread-bot-choices.mjs';

await runBrowserScenarios(
  'unread-bot-choices',
  process.argv.includes('--choices-only')
    ? [verifyUnreadBotChoices]
    : [verifyUnreadAnswers, verifyUnreadBotChoices],
  { nativeFocus: true }
);
