import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyUnreadDeliveryVisit } from '../../js/tests/helpers/e2e-unread-delivery-visit.mjs';

await questionBrowserProbe(
  { before: process.argv.includes('--before') },
  verifyUnreadDeliveryVisit
);
