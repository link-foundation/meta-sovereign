import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationConfirmations } from './helpers/e2e-application-confirmations.mjs';
import { verifyNativeLetterAttachment } from './helpers/e2e-application-letter-attachment.mjs';
await runBrowserScenarios('job-application-confirmations', [
  (browser) =>
    verifyNativeApplicationConfirmations(browser, {
      before: process.env.APPLICATION_CONFIRMATIONS_BEFORE === '1',
      screenshots: process.env.APPLICATION_SCREENSHOTS,
    }),
  verifyNativeLetterAttachment,
]);
