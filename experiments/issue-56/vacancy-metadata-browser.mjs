import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyVacancyMetadataVariants } from '../../js/tests/helpers/e2e-vacancy-metadata.mjs';

await questionBrowserProbe(
  {
    screenshots: process.argv.includes('--before')
      ? 'docs/screenshots/issue-56-vacancy-metadata/before'
      : 'docs/screenshots/issue-56-vacancy-metadata/after',
  },
  verifyVacancyMetadataVariants
);
