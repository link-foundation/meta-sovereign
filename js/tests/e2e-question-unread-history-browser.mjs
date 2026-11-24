import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyUnreadHistoryLearning } from './helpers/e2e-unread-history-learning.mjs';
import { verifyUnreadFormAfterHandover } from './helpers/e2e-unread-linked-forms.mjs';
import {
  verifyUnreadSummary,
  verifyUnreadSummaryBeforeFollowup,
} from './helpers/e2e-unread-summary.mjs';

await runBrowserScenarios(
  'question-unread-history',
  [
    verifyUnreadHistoryLearning,
    verifyUnreadSummary,
    verifyUnreadSummaryBeforeFollowup,
    verifyUnreadFormAfterHandover,
  ],
  {
    nativeFocus: true,
  }
);
