import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationChatWaiting } from '../../js/tests/helpers/e2e-application-chat-waiting.mjs';

const screenshots = process.env.APPLICATION_SCREENSHOTS;
const before = process.env.APPLICATION_CHAT_WAITING_BEFORE === '1';
const verifyWaitingWithScreenshots = (browser) =>
  verifyNativeApplicationChatWaiting(browser, { screenshots, before });
await runBrowserScenarios(
  'application-chat-waiting',
  [verifyWaitingWithScreenshots],
  { nativeFocus: true }
);
