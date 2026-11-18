import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyNativeVacancyUnavailable } from '../../js/tests/helpers/e2e-application-unavailable.mjs';

await questionBrowserProbe(
  {
    before: process.argv.includes('--before'),
    screenshots: 'docs/screenshots/issue-56-application-unavailable',
  },
  verifyNativeVacancyUnavailable
);
