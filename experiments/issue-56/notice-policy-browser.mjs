import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyNoticePolicies } from '../../js/tests/helpers/e2e-notice-policy.mjs';
await questionBrowserProbe(
  { screenshots: 'docs/screenshots/issue-56-notice-policy' },
  verifyNoticePolicies
);
