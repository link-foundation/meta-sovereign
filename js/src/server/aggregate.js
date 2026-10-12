/**
 * Contact aggregation helper shared by every route that needs to roll
 * messages up into per-contact views (R-D1).
 *
 * The owner ("me") is not their own contact. A contact carries the
 * name its latest message gave (`senderName`), and the list starts with
 * whoever was heard from last, like a messenger's contact list.
 */

const OWNER = 'me';

export const aggregateContacts = (links) => {
  const messages = links.filter((l) => l.id?.startsWith('msg:'));
  const byContact = new Map();
  for (const m of messages) {
    if (!m.sender || m.sender === OWNER) {
      continue;
    }
    const entry = byContact.get(m.sender) ?? {
      id: m.sender,
      name: null,
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
      entry.name = m.senderName ?? entry.name;
    } else {
      entry.name ??= m.senderName ?? null;
    }
    byContact.set(m.sender, entry);
  }
  return [...byContact.values()]
    .map((c) => ({
      ...c,
      networks: [...c.networks],
      chats: [...c.chats],
    }))
    .sort((a, b) => (b.lastSeen ?? '').localeCompare(a.lastSeen ?? ''));
};
