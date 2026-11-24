import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyNoticeLink } from '../../js/tests/helpers/e2e-notice-policy.mjs';

await questionBrowserProbe(
  {
    before: process.env.NOTICE_LINK_BEFORE === '1',
    screenshots: process.env.NOTICE_LINK_SCREENSHOTS,
  },
  verifyNoticeLink
);
