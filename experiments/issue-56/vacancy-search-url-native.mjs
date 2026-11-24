import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyVacancySearchUrl } from '../../js/tests/helpers/e2e-vacancy-search-url.mjs';

await questionBrowserProbe(
  {
    before: process.argv.includes('--before'),
    screenshots: 'docs/screenshots/issue-56-vacancy-search-url',
  },
  verifyVacancySearchUrl
);
