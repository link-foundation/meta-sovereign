import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyInactiveText } from '../../js/tests/helpers/e2e-inactive-text.mjs';

await questionBrowserProbe(
  { screenshots: 'docs/screenshots/issue-56-inactive-text' },
  verifyInactiveText
);
