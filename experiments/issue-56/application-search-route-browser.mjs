import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyNativeApplicationSearchRoute } from '../../js/tests/helpers/e2e-application-search-route.mjs';

await questionBrowserProbe(
  {
    before: process.env.APPLICATION_ROUTE_BEFORE === '1',
    screenshots: 'docs/screenshots/issue-56-application-search-route',
  },
  verifyNativeApplicationSearchRoute
);
