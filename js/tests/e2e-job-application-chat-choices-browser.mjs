import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationChoiceHold } from './helpers/e2e-application-chats.mjs';
import { verifyUnreadChoiceReviewControl } from './helpers/e2e-unread-choice-review.mjs';

await runBrowserScenarios(
  'job-application-chat-choices',
  [verifyNativeApplicationChoiceHold, verifyUnreadChoiceReviewControl],
  { nativeFocus: true }
);
