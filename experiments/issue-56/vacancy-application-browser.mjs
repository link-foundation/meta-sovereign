import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyApplicationPanel } from '../../js/tests/helpers/e2e-application-panel.mjs';

await questionBrowserProbe(
  {
    screenshots: 'docs/screenshots/issue-56-vacancy-application',
    cacheBefore: process.argv.includes('--before'),
  },
  verifyApplicationPanel
);
