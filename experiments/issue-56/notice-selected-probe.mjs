import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifySelectedUnreadNotice } from '../../js/tests/helpers/e2e-unread-notice-controls.mjs';

await questionBrowserProbe(
  {
    before: process.argv.includes('--before'),
    screenshots: 'docs/screenshots/issue-56/notice-selected',
  },
  verifySelectedUnreadNotice
);
