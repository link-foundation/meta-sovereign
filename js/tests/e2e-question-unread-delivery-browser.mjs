import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyUnreadDeliveryVisit } from './helpers/e2e-unread-delivery-visit.mjs';
import { verifyUnreadLiveCapture } from './helpers/e2e-unread-live-capture.mjs';

await runBrowserScenarios(
  'question-unread-delivery',
  [verifyUnreadDeliveryVisit, verifyUnreadLiveCapture],
  {
    nativeFocus: true,
  }
);
