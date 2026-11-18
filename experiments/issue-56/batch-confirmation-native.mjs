import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyNativeApplicationBatch } from '../../js/tests/helpers/e2e-application-batch.mjs';

await questionBrowserProbe(
  {
    screenshots:
      process.env.BATCH_CONFIRMATION_SCREENSHOTS ??
      'ci-logs/batch-confirmation-smoke',
  },
  verifyNativeApplicationBatch
);
