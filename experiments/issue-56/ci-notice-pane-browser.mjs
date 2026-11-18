import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyNoticeEmployerChange } from '../../js/tests/helpers/e2e-notice-policy.mjs';

await questionBrowserProbe({}, verifyNoticeEmployerChange);
