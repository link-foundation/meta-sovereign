import { createBoundedHistory } from '../replies/bounded-history.js';
import { scanLinks } from './store-scan.js';

// Legacy/manual-pattern reads also need hard bounds. Never recreate all stored
// metadata (especially lazily derived tokens/children) to answer one page.
export const factHistory = async (store, ctx = {}) => {
  if (ctx.replies?.factMessages) {
    return ctx.replies.factMessages();
  }
  const history = createBoundedHistory({
    maxMessages: 12500,
    maxBytes: 8 * 1024 ** 2,
  });
  await scanLinks(
    store,
    (link) => link.id?.startsWith('msg:'),
    (batch) => {
      for (const message of batch) {
        history.put(message);
      }
    },
    (link) => ({
      id: link.id,
      source: link.source,
      chat: link.chat,
      sender: link.sender,
      body: link.body,
      timestamp: link.timestamp,
      replyTo: link.replyTo,
    })
  );
  return history.values();
};
