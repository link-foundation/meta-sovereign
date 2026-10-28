import { networkMessageId, sortChats } from './chat-model.js';
import { DEFAULT_OPERATOR_SCOPE } from './operator-prefs.js';

export const needsAttention = (chat) => Number(chat.unread) > 0;
export const operatorEligible = (
  chat,
  scope = DEFAULT_OPERATOR_SCOPE,
  retained = false
) =>
  (needsAttention(chat) || retained) &&
  Boolean(scope[chat.bot ? 'bot' : chat.kind]);
export const operatorRevision = (chat) =>
  `${chat.last?.message?.id ?? ''}:${chat.unread}:${Boolean(chat.marked)}`;

/** One conversation per card; viewing it alone never completes it. */
export const operatorQueue = (
  chats = [],
  handled = new Map(),
  scope,
  order = [],
  work = {}
) => {
  const postponed = new Map(order.map((key, index) => [key, index]));
  return sortChats(
    chats.filter(
      (chat) =>
        operatorEligible(chat, scope, Boolean(work[chat.key])) &&
        handled.get(chat.key) !== operatorRevision(chat)
    ),
    'oldest'
  ).sort((a, b) => (postponed.get(a.key) ?? -1) - (postponed.get(b.key) ?? -1));
};

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
