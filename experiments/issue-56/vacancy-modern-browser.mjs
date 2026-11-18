import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyVacancyModern } from '../../js/tests/helpers/e2e-vacancy-modern.mjs';

await questionBrowserProbe(
  {
    screenshots: `docs/screenshots/issue-56-vacancy-modern/${process.argv.includes('--before') ? 'before' : 'after'}`,
  },
  verifyVacancyModern
);
