import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyRecognizedNotice } from '../../js/tests/helpers/e2e-notice-policy.mjs';

await questionBrowserProbe(
  {
    before: process.argv.includes('--before'),
    screenshots: 'docs/screenshots/issue-56/notice-recognized',
  },
  verifyRecognizedNotice
);
