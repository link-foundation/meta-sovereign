import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyUnreadWaiting } from './helpers/e2e-unread-waiting.mjs';

const screenshots = process.env.QUESTION_UNREAD_WAITING_SCREENSHOTS;
const before = process.env.QUESTION_UNREAD_WAITING_BEFORE === '1';
const verifyWaitingWithScreenshots = (browser) =>
  verifyUnreadWaiting(browser, { screenshots, before });
await runBrowserScenarios(
  'question-unread-waiting',
  [verifyWaitingWithScreenshots],
  {
    nativeFocus: true,
  }
);
