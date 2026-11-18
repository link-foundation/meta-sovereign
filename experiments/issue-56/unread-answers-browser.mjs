import { questionBrowserProbe } from './question-browser-probe.mjs';
import {
  verifyUnreadAnswers,
  verifyUnreadAnswerControls,
} from '../../js/tests/helpers/e2e-unread-answers.mjs';
await questionBrowserProbe(
  {
    before: process.argv.includes('--before'),
    screenshots: 'docs/screenshots/issue-56-unread-answers',
  },
  process.argv.includes('--controls')
    ? verifyUnreadAnswerControls
    : verifyUnreadAnswers
);
