import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyUnreadLinkedForms } from './helpers/e2e-unread-linked-forms.mjs';
import { verifyUnreadEmployerRating } from './helpers/e2e-unread-rating.mjs';
import { verifyUnreadSummary } from './helpers/e2e-unread-summary.mjs';

const verifyUnreadFormAfterHandover = async (browser) =>
  browser.browserType().name() === 'chromium'
    ? verifyUnreadLinkedForms(browser, { afterSummary: true })
    : { cases: 0, liveProvider: false };

await runBrowserScenarios(
  'question-unread-forms',
  process.env.E2E_EMPLOYER_RATING_BEFORE === '1'
    ? [verifyUnreadEmployerRating]
    : [
        verifyUnreadLinkedForms,
        verifyUnreadFormAfterHandover,
        verifyUnreadEmployerRating,
        verifyUnreadSummary,
      ],
  { nativeFocus: true }
);
