/**
 * Contact aggregation helper shared by every route that needs to roll
 * messages up into per-contact views (R-D1).
 *
 * The owner ("me") is not their own contact. A contact carries the
 * name its latest message gave (`senderName`), and the list starts with
 * whoever was heard from last, like a messenger's contact list.
 *
 * With `{ people: true }` (the Contacts screen) the `person:` links a
 * connected account brings — the Telegram address book, chat partners —
 * join the list too, even before any message, each with `open`: the
 * chat to write to them in.
 */

import { isPersonalChatType } from '../crm/reengage.js';

const OWNER = 'me';

const blank = (id) => ({
  id,
  name: null,
  handle: null,
  networks: new Set(),
  chats: new Set(),
  messageCount: 0,
  lastSeen: null,
  open: null,
});

const addMessage = (entry, m) => {
  entry.networks.add(m.source);
  entry.chats.add(m.chat);
  entry.messageCount += 1;
  const latest = !entry.lastSeen || (m.timestamp ?? '') > entry.lastSeen;
  if (latest) {
    entry.lastSeen = m.timestamp ?? null;
    entry.name = m.senderName ?? entry.name;
  } else {
    entry.name ??= m.senderName ?? null;
  }
  // Their one-to-one chat, where a "Message" button opens.
  if (isPersonalChatType(m.chatType) && (latest || !entry.open)) {
    entry.open = { source: m.source, chat: String(m.chat) };
  }
};

const addPerson = (entry, person) => {
  entry.networks.add(person.source);
  entry.name ??= person.name ?? null;
  entry.handle ??= person.handle ?? null;
  // A private chat is addressed by the person's own id.
  entry.open ??= { source: person.source, chat: String(person.user) };
  if (person.contact) {
    entry.contact = true;
  }
};

export const aggregateContacts = (links, { people = false } = {}) => {
  const byContact = new Map();
  const entryFor = (id) => {
    if (!byContact.has(id)) {
      byContact.set(id, blank(id));
    }
    return byContact.get(id);
  };
  for (const m of links) {
    if (m.id?.startsWith('msg:') && m.sender && m.sender !== OWNER) {
      addMessage(entryFor(m.sender), m);
    }
  }
  if (people) {
    for (const p of links) {
      if (p.id?.startsWith('person:') && p.user && p.source) {
        addPerson(entryFor(String(p.user)), p);
      }
    }
  }
  return [...byContact.values()]
    .map((c) => ({
      ...c,
      networks: [...c.networks],
      chats: [...c.chats],
    }))
    .sort(
      (a, b) =>
        (b.lastSeen ?? '').localeCompare(a.lastSeen ?? '') ||
        String(a.name ?? a.id).localeCompare(String(b.name ?? b.id))
    );
};
