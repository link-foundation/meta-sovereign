/**
 * Telegram source adapter.
 *
 * `parseArchive` accepts the JSON shape produced by Telegram Desktop's
 * "Export chat history" feature. Live API integration (MTProto via
 * konard/telegram-bot, konard/telegramify-markdown) is stubbed in
 * `live` and will be implemented in a follow-up PR (R-E2).
 */

import { buildMessageLink } from './index.js';

const SOURCE = 'telegram';

const fromTextEntity = (text) => {
  if (typeof text === 'string') {
    return text;
  }
  if (Array.isArray(text)) {
    return text.map(fromTextEntity).join('');
  }
  if (text && typeof text === 'object' && 'text' in text) {
    return text.text;
  }
  return '';
};

export const telegramSource = {
  name: SOURCE,
  async parseArchive(archive) {
    const obj = typeof archive === 'string' ? JSON.parse(archive) : archive;
    const chats = obj.chats?.list ?? (obj.name ? [obj] : []);
    const out = [];
    for (const chat of chats) {
      for (const msg of chat.messages ?? []) {
        if (msg.type !== 'message') {
          continue;
        }
        out.push(
          buildMessageLink({
            source: SOURCE,
            externalId: String(msg.id),
            sender: String(msg.from_id ?? msg.from ?? 'unknown'),
            chat: String(chat.id ?? chat.name),
            body: fromTextEntity(msg.text),
            timestamp: msg.date,
            replyTo: msg.reply_to_message_id
              ? String(msg.reply_to_message_id)
              : null,
          })
        );
      }
    }
    return out;
  },
  live: {
    async listChats() {
      throw new Error('telegram live API: not implemented yet (R-E2)');
    },
  },
};
