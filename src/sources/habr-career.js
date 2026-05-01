/**
 * career.habr.com source adapter (R-E7).
 *
 * The site has no public archive export. The adapter therefore models
 * a resume (`/resume`) as a single link and applications as messages
 * fed in via the live API once OAuth flow is wired up. For the
 * prototype it accepts a JSON object the caller has already scraped.
 */

import { buildMessageLink } from './index.js';

const SOURCE = 'habr-career';

export const habrCareerSource = {
  name: SOURCE,
  async parseArchive(archive) {
    const obj = typeof archive === 'string' ? JSON.parse(archive) : archive;
    const out = [];
    for (const m of obj.applications ?? []) {
      out.push(
        buildMessageLink({
          source: SOURCE,
          externalId: String(m.id),
          sender: m.from ?? 'self',
          chat: `vacancy:${m.vacancyId}`,
          body: m.message ?? '',
          timestamp: m.createdAt,
        })
      );
    }
    return out;
  },
  async syncResume(_profile) {
    throw new Error('habr-career resume sync: not implemented yet (R-D6)');
  },
};
