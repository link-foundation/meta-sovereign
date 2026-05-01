/**
 * LinkedIn source adapter (R-E6).
 *
 * Parses the CSVs in LinkedIn's data export — at minimum
 * `messages.csv` and `Profile.csv` — represented here as already-parsed
 * arrays of records (callers wrap the CSV reader of their choice).
 */

import { buildMessageLink } from './index.js';

const SOURCE = 'linkedin';

export const linkedinSource = {
  name: SOURCE,
  async parseArchive(archive) {
    const obj = typeof archive === 'string' ? JSON.parse(archive) : archive;
    const out = [];
    for (const row of obj.messages ?? []) {
      out.push(
        buildMessageLink({
          source: SOURCE,
          externalId: row.CONVERSATION_ID
            ? `${row.CONVERSATION_ID}-${row.DATE}`
            : String(row.id),
          sender: row.FROM ?? row.from,
          chat: row.CONVERSATION_ID ?? row.conversation,
          body: row.CONTENT ?? row.content ?? '',
          timestamp: row.DATE ?? row.date,
        })
      );
    }
    return out;
  },
  async syncResume(_profile) {
    throw new Error('linkedin resume sync: not implemented yet (R-D6)');
  },
};
