import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationBatch } from '../../js/tests/helpers/e2e-application-batch.mjs';
import { decodeWire } from '../../js/src/transport/lino.js';
import { applicationBatchResult } from '../../js/src/jobs/application-batch-data.js';

// Bounded, synthetic-only response tracing; never logs native owner answers.
await runBrowserScenarios('batch-review-trace', [
  async (browser) => {
    const pending = [];
    let count = 0;
    browser.on('context', (context) =>
      context.on('page', (page) => {
        page.on('response', (response) => {
          if (
            !response.url().includes('/api/vacancies/application') ||
            count++ >= 80
          ) {
            return;
          }
          const task = response
            .text()
            .then((text) => {
              const receipt = decodeWire(
                text,
                response.headers()['content-type']
              );
              if (receipt.mode === 'hh-application-batch') {
                try {
                  applicationBatchResult(receipt);
                } catch (error) {
                  console.log(
                    '[invalid-synthetic-batch]',
                    error.code,
                    JSON.stringify(receipt)
                  );
                }
              }
              const application = receipt.application ?? receipt;
              console.log(
                '[batch-response]',
                JSON.stringify({
                  route: new URL(response.url()).pathname,
                  status: response.status(),
                  phase: receipt.batch?.phase,
                  state: application.state,
                  active: application.active,
                  step: application.continuation?.step,
                })
              );
            })
            .catch(() => {});
          pending.push(task);
        });
      })
    );
    try {
      return await verifyNativeApplicationBatch(browser, {
        screenshots: 'docs/screenshots/batch-review-trace',
      });
    } finally {
      await Promise.allSettled(pending);
    }
  },
]);
