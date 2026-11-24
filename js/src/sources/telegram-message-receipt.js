// A resolved RPC promise is not proof that a message was accepted. Prefer the
// random_id acknowledgement; a full outgoing message must name this peer.
const text = (value) => String(value?.value ?? value ?? '');
const messageId = (value) => {
  const id = Number(text(value));
  return Number.isInteger(id) && id > 0 && id <= 2147483647 ? String(id) : null;
};
const peerKey = (peer) => {
  if (peer?.userId !== undefined) {
    return `user:${text(peer.userId)}`;
  }
  if (peer?.chatId !== undefined) {
    return `chat:${text(peer.chatId)}`;
  }
  return peer?.channelId !== undefined
    ? `channel:${text(peer.channelId)}`
    : null;
};
export const missingMessageReceipt = () =>
  Object.assign(new Error('Telegram message acknowledgement unavailable'), {
    code: 'send-unknown',
    ambiguous: true,
    fallback: false,
  });

// Library-only clients have already decoded the send response into a message.
// They still must provide a valid server ID rather than a resolved void value.
export const libraryMessageReceipt = (message) => {
  const id = messageId(message?.id);
  if (!id) {
    throw missingMessageReceipt();
  }
  return { id: Number(id), date: message.date ?? null };
};

export const messageReceipt = (answer, request) => {
  if (answer?.className === 'UpdateShortSentMessage' && messageId(answer.id)) {
    return messageId(answer.id);
  }
  const updates = Array.isArray(answer?.updates)
    ? answer.updates
    : answer?.update
      ? [answer.update]
      : [];
  const mapped = updates.find(
    (update) =>
      update?.className === 'UpdateMessageID' &&
      text(update.randomId) === text(request.randomId) &&
      text(request.randomId) !== '' &&
      messageId(update.id)
  );
  if (mapped) {
    return messageId(mapped.id);
  }
  const kind = request.scheduleDate
    ? ['UpdateNewScheduledMessage']
    : ['UpdateNewMessage', 'UpdateNewChannelMessage'];
  const peer = peerKey(request.peer);
  const sent = updates.find(
    (update) =>
      kind.includes(update?.className) &&
      update.message?.out === true &&
      peer !== null &&
      peerKey(update.message.peerId) === peer &&
      messageId(update.message.id)
  );
  if (sent) {
    return messageId(sent.message.id);
  }
  throw missingMessageReceipt();
};
