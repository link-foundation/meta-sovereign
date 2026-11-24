import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationChoiceHold } from './helpers/e2e-application-chats.mjs';
import { verifyUnreadChoiceReviewControl } from './helpers/e2e-unread-choice-review.mjs';
import { verifyChangedRejectionPreview } from '../../experiments/issue-56/application-chat-rejection-preview.mjs';

await runBrowserScenarios(
  'job-application-chat-choices',
  [
    verifyChangedRejectionPreview,
    verifyNativeApplicationChoiceHold,
    verifyUnreadChoiceReviewControl,
  ],
  { nativeFocus: true }
);
