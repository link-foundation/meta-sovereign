/**
 * Facebook source adapter (R-E5).
 *
 * Reads `messages/inbox/<thread>/message_*.json` files from Facebook's
 * download-your-data archive (UTF-8 form, not the mojibake one).
 */

import { buildMessageLink } from './index.js';

const SOURCE = 'facebook';

export const facebookSource = {
  name: SOURCE,
  async parseArchive(archive) {
    const obj = typeof archive === 'string' ? JSON.parse(archive) : archive;
    const out = [];
    const chatId = obj.thread_path ?? obj.title ?? 'unknown';
    for (const m of obj.messages ?? []) {
      out.push(
        buildMessageLink({
          source: SOURCE,
          externalId: String(
            m.timestamp_ms ?? `${m.sender_name}-${m.timestamp}`
          ),
          sender: m.sender_name,
          chat: chatId,
          body: m.content ?? '',
          timestamp: m.timestamp_ms,
        })
      );
    }
    return out;
  },
};
