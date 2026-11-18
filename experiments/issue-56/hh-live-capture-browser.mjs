import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyHhLiveCapture } from '../../js/tests/helpers/e2e-hh-live-capture.mjs';

await questionBrowserProbe(
  { collectFailures: process.env.HH_CAPTURE_BEFORE === '1' },
  verifyHhLiveCapture
);
