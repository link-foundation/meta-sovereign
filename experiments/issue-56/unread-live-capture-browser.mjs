import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyUnreadLiveCapture } from '../../js/tests/helpers/e2e-unread-live-capture.mjs';

await questionBrowserProbe(
  {
    before: process.argv.includes('--before'),
    screenshots: 'docs/screenshots/issue-56-unread-live-capture',
  },
  verifyUnreadLiveCapture
);
