import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyUnreadPollingControls } from './helpers/e2e-unread-polling-controls.mjs';

await runBrowserScenarios(
  'question-unread-polling',
  [verifyUnreadPollingControls],
  { nativeFocus: true }
);
