import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyConversationHistory } from '../../js/tests/helpers/e2e-conversation-history.mjs';
import { verifyHhChatScan } from '../../js/tests/helpers/e2e-hh-chat-scan.mjs';

await questionBrowserProbe({}, async (browser) => ({
  history: await verifyConversationHistory(browser),
  lists: await verifyHhChatScan(browser),
}));
