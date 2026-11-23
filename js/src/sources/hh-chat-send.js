// Replies to common-chat IDs must never be sent through negotiation URLs.
import { requestJson, unsupportedError, markSendOutcome } from './http.js';
import { buildMessageLink } from './link.js';
import { validHhMessageId } from './hh-chat-read.js';

const UUID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/iu;
const keyOf = (options, content) => {
  const key =
    options.idempotencyKey ??
    (UUID.test(content.clientId ?? '')
      ? content.clientId
      : globalThis.crypto.randomUUID());
  if (!UUID.test(key)) {
    throw new Error('HH idempotency key must be a UUID');
  }
  return key;
};
const validateContent = (chatId, content, text) => {
  if (!chatId || text.length > 20000) {
    throw new Error('HH chat ID and 1–20000 characters of text are required');
  }
  if (content.attachments?.length || content.replyQuote) {
    throw unsupportedError(
      'HH text sends accept only whole-message replies and plain text'
    );
  }
  const replyTo = content.replyTo ?? null;
  if (replyTo !== null && !validHhMessageId(replyTo)) {
    throw unsupportedError(
      'HH text sends require a message ID for a whole-message reply'
    );
  }
};

const acceptsReply = (chat, id) =>
  Array.isArray(chat.messages) &&
  chat.messages.length === 1 &&
  chat.messages[0]?.id === id &&
  chat.messages[0]?.can_reply === true;

const confirmedReceipt = (receipt, chat, text, replyTo) => {
  const id = receipt?.id;
  if (!validHhMessageId(id) || id === replyTo) {
    const error = markSendOutcome(
      new Error('HH did not return a sent message ID'),
      { ambiguous: true }
    );
    error.fallback = false;
    throw error;
  }
  const chatId = `chat:${chat.id}`;
  const link = buildMessageLink({
    source: 'hh',
    externalId: `${chatId}:${id}`,
    chat: chatId,
    chatName: chat.display?.title,
    sender: 'me',
    outgoing: true,
    body: text,
    timestamp: new Date().toISOString(),
    delivery: 'sent',
    ...(replyTo ? { replyTo: `msg:hh:${chatId}:${replyTo}` } : {}),
  });
  return {
    ...receipt,
    chatId: chat.id,
    messageId: id,
    protocol: 'chats',
    link: { ...link, messageId: id },
  };
};

export const sendHhChat = async ({
  fetchImpl,
  baseUrl,
  headers,
  content,
  options,
  chatId,
  text,
}) => {
  validateContent(chatId, content, text);
  const { replyTo } = content;
  const key = keyOf(options, content);
  const path = `${baseUrl.replace(/\/$/u, '')}/common/chats/${encodeURIComponent(chatId)}/messages`;
  const chat = await requestJson(fetchImpl, path, {
    headers,
    search: replyTo
      ? { order: 'next', limit: 1, start_message_id: replyTo }
      : { order: 'prev', limit: 1 },
    timeoutMs: options.timeout,
  });
  if (
    chat?.id !== chatId ||
    chat.chat_states?.write_message_state?.allowed !== true
  ) {
    throw unsupportedError(
      'HH has not confirmed that this chat accepts messages'
    );
  }
  if (replyTo && !acceptsReply(chat, replyTo)) {
    throw unsupportedError(
      'HH has not confirmed that this message accepts replies'
    );
  }
  await options.beforeIssue?.();
  const receipt = await requestJson(fetchImpl, path, {
    method: 'POST',
    headers,
    body: {
      text,
      idempotency_key: key,
      ...(replyTo ? { reply_to_message_id: replyTo } : {}),
    },
    write: true,
    expectedStatus: 201,
    timeoutMs: options.timeout,
  });
  return confirmedReceipt(receipt, chat, text, replyTo);
};
