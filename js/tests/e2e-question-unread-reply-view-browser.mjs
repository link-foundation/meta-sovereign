import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyUnreadReplyView } from './helpers/e2e-unread-reply-view.mjs';
import { verifyUnreadReplyViewControls } from './helpers/e2e-unread-reply-view-controls.mjs';

await runBrowserScenarios(
  'question-unread-reply-view',
  [verifyUnreadReplyView, verifyUnreadReplyViewControls],
  { nativeFocus: true }
);
