import { codedError, contentTarget, contentText } from './http.js';
import { publicationId, unknownPublication } from './publication-receipt.js';

const messageIdOf = (value) => {
  const id = publicationId(value);
  return id && Number(id) <= 0x7fffffff ? id : null;
};

export const telegramFormat = (format) => {
  if (format === undefined || format === 'plain') {
    return {};
  }
  if (format === 'html') {
    return { parse_mode: 'HTML' };
  }
  throw codedError(
    'Telegram publication format must be plain or html',
    'bad-draft'
  );
};

export const telegramReceipt = (result, chat) => {
  const messageId = messageIdOf(result?.message_id);
  if (!messageId) {
    throw unknownPublication('Telegram', 'publication');
  }
  return { ok: true, messageId, chat: String(result.chat?.id ?? chat) };
};

const publicationBody = (content, options) => {
  const chat = options.chat ?? contentTarget(content);
  const text = contentText(content);
  if (!chat || typeof text !== 'string' || !text.trim()) {
    throw codedError(
      'Telegram publication requires a chat and text',
      'bad-draft'
    );
  }
  return {
    chat_id: chat,
    text,
    ...telegramFormat(options.format ?? content?.format),
    ...(content?.silent ? { disable_notification: true } : {}),
    ...(content?.noWebpage
      ? { link_preview_options: { is_disabled: true } }
      : {}),
  };
};

export const createTelegramPublications = (call) => ({
  async testConnection(options = {}) {
    const raw = await call('getMe', {}, options.token);
    const botId = publicationId(raw?.id);
    if (!botId || raw.is_bot !== true) {
      throw codedError('Telegram returned no bot identity', 'bad-response');
    }
    return {
      ok: true,
      verified: true,
      mode: 'bot',
      botId,
      permissionsVerified: false,
    };
  },
  async publishPost(content, options = {}) {
    const body = publicationBody(content, options);
    const result = await call('sendMessage', body, options.token);
    return telegramReceipt(result, body.chat_id);
  },
  async deletePost(post, options = {}) {
    const chat = options.chat ?? post?.chat;
    const messageId = messageIdOf(post?.messageId);
    if (!chat || !messageId) {
      throw codedError(
        'Telegram deletion requires a chat and message ID',
        'bad-draft'
      );
    }
    const result = await call(
      'deleteMessage',
      { chat_id: chat, message_id: Number(messageId) },
      options.token
    );
    if (result === false) {
      throw codedError('Telegram did not delete the message', 'not-deleted');
    }
    if (result !== true) {
      throw unknownPublication('Telegram', 'deletion');
    }
    return { ok: true, deleted: true, chat: String(chat), messageId };
  },
});
