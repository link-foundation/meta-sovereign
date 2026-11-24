import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyUnreadHistoryLearning } from './helpers/e2e-unread-history-learning.mjs';

await runBrowserScenarios(
  'question-unread-history',
  [verifyUnreadHistoryLearning],
  {
    nativeFocus: true,
  }
);
