import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyUnreadDeliveryVisit } from './helpers/e2e-unread-delivery-visit.mjs';

await runBrowserScenarios(
  'question-unread-delivery',
  [verifyUnreadDeliveryVisit],
  {
    nativeFocus: true,
  }
);
