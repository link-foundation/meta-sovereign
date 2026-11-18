import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyNativeVacancySkipRetries } from '../../js/tests/helpers/e2e-vacancy-skip-retries.mjs';

await questionBrowserProbe(
  {
    before: process.argv.includes('--before'),
    screenshots: process.env.VACANCY_SKIP_RETRY_SCREENSHOTS,
  },
  verifyNativeVacancySkipRetries
);
