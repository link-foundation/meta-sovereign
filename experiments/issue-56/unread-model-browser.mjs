import { questionBrowserProbe } from './question-browser-probe.mjs';
import {
  verifyUnreadModel,
  verifyUnreadModelControls,
} from '../../js/tests/helpers/e2e-unread-model.mjs';
await questionBrowserProbe(
  {
    before: process.argv.includes('--before'),
    screenshots: 'docs/screenshots/issue-56-unread-model',
  },
  process.argv.includes('--controls')
    ? verifyUnreadModelControls
    : verifyUnreadModel
);
