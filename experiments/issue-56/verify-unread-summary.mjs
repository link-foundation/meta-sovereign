import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyUnreadSummary } from '../../js/tests/helpers/e2e-unread-summary.mjs';

await runBrowserScenarios('question-unread-forms', [verifyUnreadSummary], {
  nativeFocus: true,
});
