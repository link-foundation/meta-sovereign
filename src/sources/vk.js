/**
 * VK source adapter (R-E1).
 *
 * Accepts the JSON shape produced by konard/vk-export. Live API
 * (Kate-Mobile token flow via konard/vk-bot, konard/vk-browser) is
 * stubbed.
 */

import { buildMessageLink } from './index.js';

const SOURCE = 'vk';

export const vkSource = {
  name: SOURCE,
  async parseArchive(archive) {
    const obj = typeof archive === 'string' ? JSON.parse(archive) : archive;
    const out = [];
    for (const conv of obj.conversations ?? []) {
      for (const msg of conv.messages ?? []) {
        out.push(
          buildMessageLink({
            source: SOURCE,
            externalId: String(msg.id),
            sender: String(msg.from_id),
            chat: String(conv.peer?.id ?? conv.id),
            body: msg.text ?? '',
            timestamp: msg.date,
            replyTo: msg.reply_message?.id
              ? String(msg.reply_message.id)
              : null,
          })
        );
      }
    }
    return out;
  },
  live: {
    async listChats() {
      throw new Error('vk live API: not implemented yet (R-E1)');
    },
  },
};
