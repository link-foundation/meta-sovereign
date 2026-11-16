import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import {
  verifyUnreadAnswers,
  verifyUnreadAnswerControls,
} from './helpers/e2e-unread-answers.mjs';
import {
  verifyUnreadModel,
  verifyUnreadModelControls,
} from './helpers/e2e-unread-model.mjs';

await runBrowserScenarios(
  'question-unread-answers',
  [
    verifyUnreadAnswers,
    verifyUnreadAnswerControls,
    verifyUnreadModel,
    verifyUnreadModelControls,
  ],
  { nativeFocus: true }
);
