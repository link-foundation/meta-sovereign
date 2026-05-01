/**
 * X (Twitter) source adapter (R-E3).
 *
 * Accepts the user's X data archive (`tweet.js` / `direct-messages.js`
 * extracted into JSON). Outbound posting reuses konard/broadcast.
 */

import { buildMessageLink } from './index.js';

const SOURCE = 'x';

export const xSource = {
  name: SOURCE,
  async parseArchive(archive) {
    const obj = typeof archive === 'string' ? JSON.parse(archive) : archive;
    const out = [];
    for (const t of obj.tweets ?? []) {
      const tw = t.tweet ?? t;
      out.push(
        buildMessageLink({
          source: SOURCE,
          externalId: String(tw.id_str ?? tw.id),
          sender: 'self',
          chat: 'wall:self',
          body: tw.full_text ?? tw.text ?? '',
          timestamp: tw.created_at,
        })
      );
    }
    for (const dm of obj.dms ?? []) {
      out.push(
        buildMessageLink({
          source: SOURCE,
          externalId: String(dm.id),
          sender: String(dm.senderId),
          chat: String(dm.conversationId),
          body: dm.text ?? '',
          timestamp: dm.createdAt,
        })
      );
    }
    return out;
  },
};
