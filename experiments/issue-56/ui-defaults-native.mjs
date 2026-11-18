import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyUiDefaults } from '../../js/tests/helpers/e2e-ui-defaults.mjs';

await questionBrowserProbe(
  {
    before: process.argv.includes('--before'),
    screenshots: 'docs/screenshots/issue-56-ui-defaults',
  },
  verifyUiDefaults
);
