/**
 * superjob.ru source adapter (R-E9).
 *
 * Accepts a pre-fetched JSON archive of resumes + vacancy responses
 * (the public API at api.superjob.ru returns this shape). Live OAuth
 * flow is a follow-up.
 */

import { buildMessageLink } from './index.js';

const SOURCE = 'superjob';

export const superjobSource = {
  name: SOURCE,
  async parseArchive(archive) {
    const obj = typeof archive === 'string' ? JSON.parse(archive) : archive;
    const out = [];
    for (const m of obj.responses ?? []) {
      out.push(
        buildMessageLink({
          source: SOURCE,
          externalId: String(m.id),
          sender: m.from ?? 'self',
          chat: `vacancy:${m.vacancy_id}`,
          body: m.message ?? '',
          timestamp: m.date,
        })
      );
    }
    return out;
  },
  async syncResume(_profile) {
    throw new Error('superjob resume sync: not implemented yet (R-D6)');
  },
};
