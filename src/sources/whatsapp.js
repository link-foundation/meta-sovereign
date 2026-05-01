/**
 * WhatsApp source adapter (R-E4).
 *
 * Parses the `_chat.txt` text format produced by WhatsApp's per-chat
 * "Export chat" feature. Each line looks like:
 *   `[2026-04-30, 14:32:11] Alice: Hello!`
 */

import { buildMessageLink } from './index.js';

const SOURCE = 'whatsapp';
const LINE = /^\[([^\]]+)\]\s+([^:]+):\s+(.*)$/;

export const whatsappSource = {
  name: SOURCE,
  async parseArchive(archive) {
    const text = typeof archive === 'string' ? archive : String(archive);
    const out = [];
    let counter = 0;
    let chatId = 'unknown';
    if (typeof archive === 'object' && archive?.chat) {
      chatId = String(archive.chat);
    }
    for (const raw of text.split(/\r?\n/)) {
      const m = raw.match(LINE);
      if (!m) {
        continue;
      }
      const [, ts, sender, body] = m;
      counter += 1;
      out.push(
        buildMessageLink({
          source: SOURCE,
          externalId: String(counter),
          sender: sender.trim(),
          chat: chatId,
          body,
          timestamp: ts,
        })
      );
    }
    return out;
  },
};
