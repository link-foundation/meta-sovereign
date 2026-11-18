import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyNativeVacancySkipPreview } from '../../js/tests/helpers/e2e-vacancy-skip-preview.mjs';

await questionBrowserProbe(
  {
    before: process.argv.includes('--native'),
    screenshots: 'docs/screenshots/issue-56-skip-preview',
  },
  verifyNativeVacancySkipPreview
);
