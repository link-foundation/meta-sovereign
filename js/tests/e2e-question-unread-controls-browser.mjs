import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyQuestionUnreadControls } from './helpers/e2e-question-unread-controls.mjs';

await runBrowserScenarios(
  'question-unread-controls',
  [verifyQuestionUnreadControls],
  { nativeFocus: true }
);
