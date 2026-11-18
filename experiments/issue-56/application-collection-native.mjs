import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyNativeApplicationCollection } from '../../js/tests/helpers/e2e-application-collection.mjs';

await questionBrowserProbe(
  {
    screenshots: 'docs/screenshots/issue-56-application-collection',
    before: process.argv.includes('--before'),
  },
  verifyNativeApplicationCollection
);
