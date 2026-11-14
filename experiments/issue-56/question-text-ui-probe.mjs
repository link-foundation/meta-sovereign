import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyQuestionTextControls } from '../../js/tests/helpers/e2e-question-text-controls.mjs';

await questionBrowserProbe(
  {
    before: process.argv.includes('--before'),
    screenshots: 'docs/screenshots/issue-56-question-text-ui',
  },
  verifyQuestionTextControls
);
