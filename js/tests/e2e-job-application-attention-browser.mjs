import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationAttention } from './helpers/e2e-application-attention.mjs';
import { verifyApplicationAttentionChime } from './helpers/e2e-application-attention-chime.mjs';

const selected =
  process.env.HH_ATTENTION_CHIME_ONLY === '1'
    ? verifyApplicationAttentionChime
    : process.env.HH_ATTENTION_ONLY === '1'
      ? verifyNativeApplicationAttention
      : null;

await runBrowserScenarios(
  'job-application-attention',
  [verifyNativeApplicationAttention, verifyApplicationAttentionChime].filter(
    (check) => !selected || check === selected
  )
);
