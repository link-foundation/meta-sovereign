import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyUnreadLinkedForms } from './helpers/e2e-unread-linked-forms.mjs';

await runBrowserScenarios('question-unread-forms', [verifyUnreadLinkedForms], {
  nativeFocus: true,
});
