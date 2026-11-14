import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationBatch } from './helpers/e2e-application-batch.mjs';
await runBrowserScenarios('job-application-batch', [
  (browser) =>
    verifyNativeApplicationBatch(browser, {
      before: process.env.APPLICATION_BATCH_BEFORE === '1',
      screenshots: process.env.APPLICATION_SCREENSHOTS,
    }),
]);
