import { networkMessageId, sortChats } from './chat-model.js';

export const needsAttention = (chat) => Number(chat.unread) > 0;
export const operatorRevision = (chat) =>
  `${chat.last?.message?.id ?? ''}:${chat.unread}:${Boolean(chat.marked)}`;

/** One conversation per card; viewing it alone never completes it. */
export const operatorQueue = (chats = [], handled = new Map()) =>
  sortChats(
    chats.filter(
      (chat) =>
        needsAttention(chat) && handled.get(chat.key) !== operatorRevision(chat)
    ),
    'oldest'
  );

export const operatorReadMax = (chat, messages = []) =>
  Math.max(
    0,
    ...[chat?.last?.message, ...messages].map((m) => networkMessageId(m) ?? 0)
  );

/** Explicit Done acknowledges only the history already displayed or previewed. */
export const completeOperatorChat = async (api, chat, messages) => {
  const check = (answer) => {
    if (
      !answer ||
      answer.error ||
      answer.ok === false ||
      answer.status === 'failed'
    ) {
      throw new Error(answer?.error ?? answer?.code ?? 'server-required');
    }
  };
  if (chat.source !== 'telegram') {
    check(
      await api.messageAction('read', { source: chat.source, chat: chat.chat })
    );
    return;
  }
  const maxId = operatorReadMax(chat, messages);
  if (chat.unread > 0 && !maxId) {
    throw new Error('history-required');
  }
  if (maxId) {
    check(await api.telegramRead({ chat: chat.chat, maxId }));
  }
  if (chat.marked) {
    check(await api.telegramDialog({ chat: chat.chat, action: 'unmark' }));
  }
};
