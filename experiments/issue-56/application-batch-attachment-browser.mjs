import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';

const parent = process.env.APPLICATION_BATCH_PARENT;
if (parent) {
  const source = readFileSync(parent, 'utf8');
  const moduleUrl = new URL(
    '../../js/src/jobs/application-batch.js',
    import.meta.url
  ).href;
  registerHooks({
    load(url, context, nextLoad) {
      return url === moduleUrl
        ? { format: 'module', source, shortCircuit: true }
        : nextLoad(url, context);
    },
  });
}

const { verifyNativeBatchLetterAttachment } =
  await import('../../js/tests/helpers/e2e-application-batch-attachment.mjs');
await runBrowserScenarios('application-batch-letter-attachment', [
  (browser) =>
    verifyNativeBatchLetterAttachment(browser, { before: Boolean(parent) }),
]);
