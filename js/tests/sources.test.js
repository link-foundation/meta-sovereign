import { describe, it, expect } from 'test-anywhere';
import { listSources, getSource, importInto } from '../src/sources/index.js';
import { createMemoryStore } from '../src/storage/index.js';

describe('source registry', () => {
  it('lists all 13 networks', () => {
    expect(listSources().length).toBe(13);
    expect(listSources().includes('email')).toBe(true);
    expect(listSources().includes('github')).toBe(true);
    expect(listSources().includes('upwork')).toBe(true);
    expect(listSources().includes('peopleperhour')).toBe(true);
  });
  it('throws on unknown source', () => {
    let caught = false;
    try {
      getSource('myspace');
    } catch {
      caught = true;
    }
    expect(caught).toBe(true);
  });
});

describe('email archives', () => {
  it('imports a single .eml message', async () => {
    const eml = [
      'Message-ID: <m1@example.com>',
      'From: Alice <alice@example.com>',
      'To: Bob <bob@example.com>',
      'Subject: Hello',
      'Date: Sun, 03 May 2026 10:00:00 +0000',
      '',
      'Plain body',
    ].join('\r\n');
    const out = await getSource('email').parseArchive(eml);
    expect(out.length).toBe(1);
    expect(out[0].id).toBe('msg:email:m1@example.com');
    expect(out[0].sender).toBe('alice@example.com');
    expect(out[0].to[0].address).toBe('bob@example.com');
    expect(out[0].subject).toBe('Hello');
    expect(out[0].body).toBe('Plain body');
  });

  it('imports mbox archives as separate messages', async () => {
    const mbox = [
      'From alice@example.com Sun May  3 10:00:00 2026',
      'Message-ID: <m1@example.com>',
      'From: alice@example.com',
      'To: bob@example.com',
      'Subject: First',
      '',
      'one',
      'From bob@example.com Sun May  3 11:00:00 2026',
      'Message-ID: <m2@example.com>',
      'From: bob@example.com',
      'To: alice@example.com',
      'Subject: Second',
      '',
      'two',
    ].join('\n');
    const out = await getSource('email').parseArchive(mbox);
    expect(out.length).toBe(2);
    expect(out[0].body).toBe('one');
    expect(out[1].id).toBe('msg:email:m2@example.com');
    expect(out[1].subject).toBe('Second');
  });
});

describe('telegram archive', () => {
  it('extracts messages', async () => {
    const archive = {
      chats: {
        list: [
          {
            id: 1,
            name: 'Friends',
            messages: [
              {
                id: 10,
                type: 'message',
                from_id: 'u1',
                date: 't1',
                text: 'hi',
              },
              { id: 11, type: 'service' },
            ],
          },
        ],
      },
    };
    const store = createMemoryStore();
    const n = await importInto(store, 'telegram', archive);
    expect(n).toBe(1);
    const all = await store.query();
    expect(all[0].body).toBe('hi');
    expect(all[0].id).toBe('msg:telegram:10');
  });
});

describe('whatsapp archive', () => {
  it('parses bracketed lines', async () => {
    const text =
      '[2026-04-30, 14:32:11] Alice: Hello!\n[2026-04-30, 14:33:00] Bob: Hi!';
    const out = await getSource('whatsapp').parseArchive(text);
    expect(out.length).toBe(2);
    expect(out[0].sender).toBe('Alice');
    expect(out[1].body).toBe('Hi!');
  });
});

describe('vk and x archives', () => {
  it('parse a single record each', async () => {
    const vk = await getSource('vk').parseArchive({
      conversations: [
        {
          peer: { id: 7 },
          messages: [{ id: 1, from_id: 'u', date: 0, text: 'sup' }],
        },
      ],
    });
    expect(vk[0].body).toBe('sup');
    const x = await getSource('x').parseArchive({
      tweets: [
        { tweet: { id_str: 't1', full_text: 'hi twitter', created_at: 'now' } },
      ],
    });
    expect(x[0].body).toBe('hi twitter');
  });
});
