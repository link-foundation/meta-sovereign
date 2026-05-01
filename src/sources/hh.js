/**
 * hh.ru source adapter (R-E8).
 *
 * Wraps the official hh.ru API (https://api.hh.ru) for resume
 * read/write and message threads on vacancy responses. The prototype
 * accepts a pre-fetched JSON object; live API plumbing is a follow-up.
 */

import { buildMessageLink } from './index.js';

const SOURCE = 'hh';

export const hhSource = {
  name: SOURCE,
  async parseArchive(archive) {
    const obj = typeof archive === 'string' ? JSON.parse(archive) : archive;
    const out = [];
    for (const m of obj.negotiations ?? []) {
      out.push(
        buildMessageLink({
          source: SOURCE,
          externalId: String(m.id),
          sender: m.author?.id ?? 'unknown',
          chat: `vacancy:${m.vacancy?.id}`,
          body: m.text ?? '',
          timestamp: m.created_at,
        })
      );
    }
    return out;
  },
  async syncResume(_profile) {
    throw new Error('hh resume sync: not implemented yet (R-D6)');
  },
};
