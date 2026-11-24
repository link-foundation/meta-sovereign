import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import {
  verifyUnreadFormAfterApprovedNotice,
  verifyUnreadLinkedForms,
} from './helpers/e2e-unread-linked-forms.mjs';
import { verifyUnreadEmployerRating } from './helpers/e2e-unread-rating.mjs';

await runBrowserScenarios(
  'question-unread-forms',
  process.env.E2E_EMPLOYER_RATING_BEFORE === '1'
    ? [verifyUnreadEmployerRating]
    : [
        verifyUnreadLinkedForms,
        verifyUnreadEmployerRating,
        verifyUnreadFormAfterApprovedNotice,
      ],
  { nativeFocus: true }
);
