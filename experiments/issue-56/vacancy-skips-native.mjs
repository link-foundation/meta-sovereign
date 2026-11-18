import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyNativeVacancySkips } from '../../js/tests/helpers/e2e-vacancy-skips.mjs';

await questionBrowserProbe(
  {
    before: process.argv.includes('--before'),
    screenshots:
      process.env.VACANCY_SKIP_SCREENSHOTS ??
      'docs/screenshots/issue-56-vacancy-skips',
  },
  verifyNativeVacancySkips
);
