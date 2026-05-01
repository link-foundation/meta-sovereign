/**
 * CRM module (R-D1..R-D4).
 *
 * - `aggregateContact(store, contactId)` collects every link
 *   referencing the contact into a single view.
 * - Set-algebra over saved queries: `intersect`, `union`, `difference`.
 * - `localSearch` runs a Dice-similarity scan over messages, contacts,
 *   chats, communities — the simplest implementation that satisfies
 *   "configurable parameters" without taking a search-index dep yet.
 */

import { dice } from '../replies/index.js';

export const aggregateContact = async (store, contactId) => {
  const all = await store.query();
  const messages = all.filter(
    (l) =>
      l.sender === contactId || l.children?.some((c) => c.includes(contactId))
  );
  const chats = new Set(messages.map((m) => m.chat));
  return {
    id: contactId,
    chats: [...chats],
    messageCount: messages.length,
    messages,
  };
};

export const intersect = (a, b) => {
  const idsB = new Set(b.map((l) => l.id));
  return a.filter((l) => idsB.has(l.id));
};
export const union = (a, b) => {
  const map = new Map();
  [...a, ...b].forEach((l) => map.set(l.id, l));
  return [...map.values()];
};
export const difference = (a, b) => {
  const idsB = new Set(b.map((l) => l.id));
  return a.filter((l) => !idsB.has(l.id));
};

export const localSearch = async (
  store,
  { query, fields = ['body'], min = 0.3 } = {}
) => {
  const all = await store.query();
  return all
    .map((l) => {
      const hay = fields
        .map((f) => l[f])
        .filter((v) => typeof v === 'string')
        .join(' ');
      return { link: l, score: hay ? dice(query, hay) : 0 };
    })
    .filter((r) => r.score >= min)
    .sort((a, b) => b.score - a.score);
};
