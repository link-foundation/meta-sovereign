import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import {
  verifyUnreadAnswers,
  verifyUnreadAnswerControls,
} from './helpers/e2e-unread-answers.mjs';

await runBrowserScenarios(
  'question-unread-answers',
  [verifyUnreadAnswers, verifyUnreadAnswerControls],
  { nativeFocus: true }
);
