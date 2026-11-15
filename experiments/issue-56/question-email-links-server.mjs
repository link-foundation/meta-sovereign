import { createMemoryStore } from '../../js/src/storage/universal.js';
import { normalizeAutomation } from '../../js/src/automation/automations.js';
import {
  questionApiLinksServer,
  serveQuestionLinkFixture,
} from './question-api-links-server.mjs';
import {
  emailLinkMessage,
  emailLinkAutomation,
  apiLinkRule,
} from './question-email-links-fixture.mjs';

export const questionEmailLinksServer = () =>
  questionApiLinksServer(async () => {
    const store = createMemoryStore();
    for (const record of [
      apiLinkRule,
      emailLinkMessage(),
      normalizeAutomation(emailLinkAutomation),
    ]) {
      await store.put(record);
    }
    return store;
  });

if (process.argv.includes('--serve') && process.argv.includes('--email')) {
  serveQuestionLinkFixture(await questionEmailLinksServer());
}
