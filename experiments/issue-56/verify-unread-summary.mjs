import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import {
  verifyUnreadSummary,
  verifyUnreadSummaryBeforeFollowup,
} from '../../js/tests/helpers/e2e-unread-summary.mjs';

await runBrowserScenarios(
  'question-unread-forms',
  [
    process.argv.includes('--followup')
      ? verifyUnreadSummaryBeforeFollowup
      : verifyUnreadSummary,
  ],
  { nativeFocus: true }
);
