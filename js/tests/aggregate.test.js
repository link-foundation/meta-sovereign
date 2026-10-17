// Issue #31 / PR #34: contacts are the people the owner talks to, named
// as their messages name them, newest first; the owner is not one.
import { describe, it, expect } from 'test-anywhere';
import { aggregateContacts } from '../src/server/aggregate.js';
import { createOfflineClient } from '../src/web/client.js';

const msg = (n, sender, timestamp, extra = {}) => ({
  id: `msg:vk:${n}`,
  source: 'vk',
  chat: sender === 'me' ? '1' : sender,
  sender,
  timestamp,
  ...extra,
});

const links = [
  msg(1, 'me', '2026-10-03T00:00:00Z'),
  msg(2, '1', '2026-01-01T00:00:00Z', { senderName: 'Аня' }),
  msg(3, '1', '2026-02-01T00:00:00Z', { senderName: 'Анна' }),
  msg(4, '2', '2026-09-01T00:00:00Z'),
  msg(5, '2', '2026-08-01T00:00:00Z', { senderName: 'Иван' }),
  { id: 'note:x', sender: '3' },
];

describe('aggregateContacts', () => {
  it('skips the owner, names from messages, newest first', () => {
    const contacts = aggregateContacts(links);
    expect(contacts.map((c) => c.id)).toEqual(['2', '1']);
    // The latest message's name wins; an older one fills a gap.
    expect(contacts[1].name).toBe('Анна');
    expect(contacts[0].name).toBe('Иван');
    expect(contacts[0].messageCount).toBe(2);
    expect(contacts[0].lastSeen).toBe('2026-09-01T00:00:00Z');
    expect(contacts[0].networks).toEqual(['vk']);
  });

  it('the offline client lists the same contacts', async () => {
    const client = createOfflineClient({
      store: { query: async () => links },
      server: null,
    });
    expect(await client.contacts()).toEqual(aggregateContacts(links));
  });
});

describe('aggregateContacts with people', () => {
  const telegram = [
    {
      id: 'msg:telegram:42:2',
      source: 'telegram',
      chat: '42',
      sender: '42',
      senderName: 'Alice',
      chatType: 'personal_chat',
      timestamp: '2026-10-01T00:00:00Z',
    },
    {
      id: 'person:telegram:42',
      source: 'telegram',
      user: '42',
      name: 'Alice Liddell',
      handle: 'alice',
      contact: true,
    },
    {
      id: 'person:telegram:77',
      source: 'telegram',
      user: '77',
      name: 'Bob',
      handle: null,
      contact: true,
    },
  ];

  it('adds the address book, each person once, with a chat to open', () => {
    const contacts = aggregateContacts(telegram, { people: true });
    expect(contacts.map((c) => c.id)).toEqual(['42', '77']);
    expect(contacts[0].name).toBe('Alice');
    expect(contacts[0].handle).toBe('alice');
    expect(contacts[0].open).toEqual({ source: 'telegram', chat: '42' });
    expect(contacts[1].messageCount).toBe(0);
    expect(contacts[1].open).toEqual({ source: 'telegram', chat: '77' });
  });

  it('leaves audiences to people who wrote (no people option)', () => {
    expect(aggregateContacts(telegram).map((c) => c.id)).toEqual(['42']);
  });
});
