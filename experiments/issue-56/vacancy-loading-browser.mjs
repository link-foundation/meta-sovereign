import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyVacancyLoading } from '../../js/tests/helpers/e2e-vacancy-loading.mjs';

await questionBrowserProbe(
  { screenshots: 'docs/screenshots/issue-56-vacancy-loading' },
  verifyVacancyLoading
);
