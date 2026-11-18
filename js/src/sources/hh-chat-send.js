// Replies to common-chat IDs must never be sent through negotiation URLs.
import { requestJson, unsupportedError, markSendOutcome } from './http.js';

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
  if (content.attachments?.length || content.replyTo) {
    throw unsupportedError(
      'HH text sends do not support attachments or quoted replies'
    );
  }
};
const confirmedReceipt = (receipt, chatId) => {
  if (typeof receipt?.id !== 'string' || !receipt.id.trim()) {
    const error = markSendOutcome(
      new Error('HH did not return a sent message ID'),
      { ambiguous: true }
    );
    error.fallback = false;
    throw error;
  }
  return { ...receipt, chatId, messageId: receipt.id, protocol: 'chats' };
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
  const key = keyOf(options, content);
  const path = `${baseUrl.replace(/\/$/u, '')}/common/chats/${encodeURIComponent(chatId)}/messages`;
  const chat = await requestJson(fetchImpl, path, {
    headers,
    search: { order: 'prev', limit: 1 },
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
  const receipt = await requestJson(fetchImpl, path, {
    method: 'POST',
    headers,
    body: { text, idempotency_key: key },
    write: true,
    timeoutMs: options.timeout,
  });
  return confirmedReceipt(receipt, chatId);
};
