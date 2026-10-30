import { sortChats } from './chat-model.js';

// A local send updates the directory immediately, without claiming delivery.
// Keep the confirmed directory intact; the outbox owns persistence and retries.
export const pendingChatPreviews = (chats, pending = [], sort = 'latest') => {
  if (!pending.length) {
    return chats;
  }
  const newest = new Map();
  for (const item of pending) {
    if (!item.scheduleDate || item.status === 'failed') {
      const was = newest.get(item.key);
      if (!was || item.at >= was.at) {
        newest.set(item.key, item);
      }
    }
  }
  let changed = false;
  const next = chats.map((chat) => {
    const item = newest.get(chat.key);
    if (
      !item ||
      item.clientId === chat.last.message?.clientId ||
      item.at < chat.last.at
    ) {
      return chat;
    }
    changed = true;
    const message = {
      id: `pending:${item.clientId}`,
      clientId: item.clientId,
      source: item.source,
      chat: item.chat,
      sender: 'me',
      body: item.text,
      timestamp: item.at,
      pending: true,
    };
    return {
      ...chat,
      draft: '',
      pendingStatus: item.status,
      last: { body: item.text, mine: true, at: item.at, message },
    };
  });
  return changed
    ? sortChats(
        next.sort((a, b) => String(b.last.at).localeCompare(String(a.last.at))),
        sort
      )
    : chats;
};
