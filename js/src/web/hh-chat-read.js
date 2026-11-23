export const hhReadRequest = (chat, messages) => {
  const latest = chat.hhLatestMessageId;
  if (!latest) {
    return null;
  }
  const target = `msg:hh:${chat.chat}:${latest}`;
  if (!messages.some((message) => message.id === target)) {
    return null;
  }
  return { source: 'hh', chat: chat.chat, ids: [target] };
};
