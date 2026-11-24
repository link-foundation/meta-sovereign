import { hhCommonChatId, validHhMessageId } from './hh-chat-read.js';
import { codedError, requestJson } from './http.js';

const refusal = (message, code = 'unsupported-action') =>
  Object.assign(codedError(message, code), { fallback: false });

const matchesSavedMessage = (link, chatId, id) =>
  link?.source === 'hh' &&
  link.chat === `chat:${chatId}` &&
  link.hhChat?.id === chatId &&
  link.messageId === id &&
  link.raw?.id === id &&
  !link.deleted;

const isOwnMessage = (message) =>
  message?.type === 'SIMPLE' &&
  message.sender_display_info?.is_current_participant === true;

const validateEdit = (link, message, text) => {
  if (message.can_edit !== true || typeof message.payload?.text !== 'string') {
    throw refusal(
      'HeadHunter has not confirmed that this message can be edited'
    );
  }
  if (message.payload.text !== link.raw.payload?.text) {
    throw refusal(
      'The message changed in HeadHunter. Refresh this chat.',
      'history-changed'
    );
  }
  if (typeof text !== 'string' || !text.trim() || text.length > 20000) {
    throw refusal(
      'HeadHunter edits require 1–20000 characters of text',
      'bad-draft'
    );
  }
};

const readOwnMessage = async ({
  fetchImpl,
  path,
  chatId,
  id,
  headers,
  timeoutMs,
}) => {
  const history = await requestJson(fetchImpl, path, {
    headers,
    timeoutMs,
    search: { order: 'next', limit: 1, start_message_id: id },
  });
  const message = history?.messages?.[0];
  if (
    history?.id !== chatId ||
    !Array.isArray(history.messages) ||
    history.messages.length !== 1 ||
    message?.id !== id ||
    !isOwnMessage(message)
  ) {
    throw refusal('HeadHunter has not confirmed this message belongs to you');
  }
  return message;
};

export const mutateHhChatMessage = async ({
  fetchImpl,
  baseUrl,
  headers,
  timeoutMs,
  chat,
  id,
  link,
  edit,
  text,
}) => {
  const chatId = hhCommonChatId(chat);
  if (
    !chatId ||
    !validHhMessageId(id) ||
    !matchesSavedMessage(link, chatId, id)
  ) {
    throw refusal('One saved HeadHunter common-chat message is required');
  }
  const path = `${baseUrl.replace(/\/$/u, '')}/common/chats/${encodeURIComponent(chatId)}/messages`;
  const message = await readOwnMessage({
    fetchImpl,
    path,
    chatId,
    id,
    headers,
    timeoutMs,
  });
  if (edit) {
    validateEdit(link, message, text);
  }
  try {
    await requestJson(fetchImpl, `${path}/${encodeURIComponent(id)}`, {
      headers,
      timeoutMs,
      method: edit ? 'PUT' : 'DELETE',
      ...(edit ? { body: { text } } : {}),
      write: true,
      expectedStatus: 204,
    });
  } catch (error) {
    if (error.ambiguous) {
      error.code = 'mutation-unconfirmed';
      error.message =
        'HeadHunter did not confirm the change. Check the conversation in HeadHunter before trying again.';
    }
    throw Object.assign(error, { fallback: false });
  }
  return { messageId: id };
};
