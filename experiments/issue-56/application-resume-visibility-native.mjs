import { questionBrowserProbe } from './question-browser-probe.mjs';
import {
  verifyNativeResumeVisibility,
  verifyPopupResumeVisibility,
} from '../../js/tests/helpers/e2e-application-resume-visibility.mjs';

await questionBrowserProbe(
  {
    before: process.argv.includes('--before'),
    screenshots: 'docs/screenshots/issue-56-application-resume-visibility',
  },
  async (browser, options) => ({
    main: await verifyNativeResumeVisibility(browser, options),
    popup: await verifyPopupResumeVisibility(browser),
  })
);
