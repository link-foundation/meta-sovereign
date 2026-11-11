import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyInactiveHistory } from '../../js/tests/helpers/e2e-inactive-history.mjs';

await questionBrowserProbe({}, verifyInactiveHistory);
