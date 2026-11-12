import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyUnreadNoticeControls } from './helpers/e2e-unread-notice-controls.mjs';

await runBrowserScenarios(
  'question-unread-notices',
  [verifyUnreadNoticeControls],
  { nativeFocus: true }
);
