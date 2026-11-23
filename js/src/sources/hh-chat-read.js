import { codedError, requestJson } from './http.js';
import { createStoreQueue } from '../storage/serialized.js';

const segment = (id) =>
  typeof id === 'string' &&
  id.trim() &&
  id.length <= 300 &&
  id !== '.' &&
  id !== '..';

const readFailure = (message, code) =>
  Object.assign(codedError(message, code), { fallback: false });

export const hhReadState = (chat, latestMessageId, checkedAt) => {
  const count = chat.unread_message_count;
  if (!Number.isSafeInteger(count) || count < 0) {
    return null;
  }
  const key = `chat:${chat.id}`;
  return {
    id: `read:hh:${key}`,
    tokens: ['read', 'hh', key],
    kind: 'read',
    source: 'hh',
    chat: key,
    chatName: chat.display?.title,
    unreadCount: count,
    hhLatestMessageId: latestMessageId ?? null,
    checkedAt,
  };
};

const queueReadState = createStoreQueue();
export const storeHhReadState = (store, state) =>
  queueReadState(store, async () => {
    const current = await store.get(state.id);
    if (String(current?.checkedAt ?? '') > String(state.checkedAt ?? '')) {
      return current;
    }
    await store.put(state);
    return state;
  });

const readLatest = async (fetchImpl, path, chatId, options) => {
  const checkedAt = new Date().toISOString();
  const chat = await requestJson(fetchImpl, `${path}/messages`, {
    ...options,
    search: { order: 'prev', limit: 1 },
  });
  if (
    chat?.id !== chatId ||
    !Array.isArray(chat.messages) ||
    chat.messages.length > 1 ||
    (chat.messages.length && !segment(chat.messages[0]?.id))
  ) {
    throw readFailure(
      'HH returned a different chat or an invalid message',
      'invalid-history'
    );
  }
  const snapshot = hhReadState(chat, chat.messages[0]?.id, checkedAt);
  if (!snapshot || (snapshot.unreadCount && !snapshot.hhLatestMessageId)) {
    throw readFailure(
      'HH did not return a valid unread count and message',
      'invalid-history'
    );
  }
  return snapshot;
};

export const markHhChatRead = async ({
  fetchImpl,
  baseUrl,
  headers,
  chatId,
  id,
  timeoutMs,
}) => {
  const path = `${baseUrl.replace(/\/$/u, '')}/common/chats/${encodeURIComponent(chatId)}`;
  const options = { headers, timeoutMs };
  const refresh = () => readLatest(fetchImpl, path, chatId, options);
  const before = await refresh();
  if (!before.unreadCount) {
    return { read: true, readState: before };
  }
  const messageId = before.hhLatestMessageId;
  if (id !== undefined && id !== messageId) {
    throw readFailure(
      'HH has newer history. Refresh the chat before marking it read.',
      'history-changed'
    );
  }
  await requestJson(
    fetchImpl,
    `${path}/message/${encodeURIComponent(messageId)}/read`,
    {
      ...options,
      method: 'PUT',
      expectedStatus: 204,
    }
  );
  // A 204 acknowledges the cursor. Only another read can establish the
  // remaining count, because more messages can arrive during the request.
  const readState = await refresh().catch(() => null);
  return { read: true, messageId, readState };
};

export const hhCommonChatId = (chat) => {
  const id =
    typeof chat === 'string' && chat.startsWith('chat:') && chat.slice(5);
  return segment(id) ? id : null;
};
