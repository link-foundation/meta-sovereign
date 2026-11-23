import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationHolds } from './helpers/e2e-application-holds.mjs';
import { verifyNativeApplicationAttention } from './helpers/e2e-application-attention.mjs';
import { verifyNativeApplicationRetries } from './helpers/e2e-application-retries.mjs';
import { verifyNativeApplicationSupervised } from './helpers/e2e-application-supervised.mjs';
import { verifyNativeApplicationPopup } from './helpers/e2e-application-popup.mjs';

await runBrowserScenarios(
  'job-application-policies',
  process.env.HH_ATTENTION_ONLY === '1'
    ? [verifyNativeApplicationAttention]
    : [
        verifyNativeApplicationHolds,
        verifyNativeApplicationRetries,
        verifyNativeApplicationSupervised,
        verifyNativeApplicationPopup,
        verifyNativeApplicationAttention,
      ]
);
