/**
 * Contact aggregation helper shared by every route that needs to roll
 * messages up into per-contact views (R-D1).
 */

export const aggregateContacts = (links) => {
  const messages = links.filter((l) => l.id?.startsWith('msg:'));
  const byContact = new Map();
  for (const m of messages) {
    if (!m.sender) {
      continue;
    }
    const entry = byContact.get(m.sender) ?? {
      id: m.sender,
      networks: new Set(),
      chats: new Set(),
      messageCount: 0,
      lastSeen: null,
    };
    entry.networks.add(m.source);
    entry.chats.add(m.chat);
    entry.messageCount += 1;
    if (!entry.lastSeen || (m.timestamp ?? '') > entry.lastSeen) {
      entry.lastSeen = m.timestamp ?? null;
    }
    byContact.set(m.sender, entry);
  }
  return [...byContact.values()].map((c) => ({
    ...c,
    networks: [...c.networks],
    chats: [...c.chats],
  }));
};
