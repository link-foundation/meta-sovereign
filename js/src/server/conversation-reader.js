import { conversationMessage } from '../crm/conversation-record.js';

export const readConversation = async (
  index,
  key,
  { maxMessages, maxChatBytes }
) => {
  const pages = [];
  let before = null;
  let size = 0;
  let count = 0;
  let more;
  do {
    const page = await index.page(key, {
      before,
      limit: 250,
      project: conversationMessage,
    });
    more = Boolean(page.more);
    const batch = [];
    for (const raw of page.messages.toReversed()) {
      const message = conversationMessage(raw);
      if (message.outgoing) {
        message.sender = 'me';
      }
      const cost = (message.body?.length ?? 0) * 2 + 512;
      if (size + cost > maxChatBytes || count >= maxMessages) {
        return {
          messages: [batch, ...pages].flat(),
          truncated: true,
          bytes: size,
        };
      }
      batch.unshift(message);
      size += cost;
      count++;
    }
    pages.unshift(batch);
    before = page.messages[0]?.id;
    if (!page.messages.length) {
      break;
    }
    if (more) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    }
  } while (more);
  return { messages: pages.flat(), truncated: more, bytes: size };
};
