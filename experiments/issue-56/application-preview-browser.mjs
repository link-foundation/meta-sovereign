import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyNativeVacancyPreview } from '../../js/tests/helpers/e2e-application-preview.mjs';

await questionBrowserProbe(
  {
    before: process.env.APPLICATION_PREVIEW_BEFORE === '1',
    screenshots: 'docs/screenshots/issue-56-vacancy-preview',
  },
  verifyNativeVacancyPreview
);
