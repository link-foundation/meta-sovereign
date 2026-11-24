import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyNoticePolicyControls } from '../../js/tests/helpers/e2e-notice-policy-controls.mjs';
await questionBrowserProbe(
  {
    screenshots: 'docs/screenshots/issue-56-notice-policy',
    before: process.argv.includes('--before'),
  },
  verifyNoticePolicyControls
);
