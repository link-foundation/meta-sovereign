import { describe, it, expect } from 'test-anywhere';
import { createMemoryStore } from '../src/storage/index.js';
import {
  aggregateContact,
  intersect,
  union,
  difference,
  localSearch,
} from '../src/crm/index.js';
import { extractFacts } from '../src/facts/index.js';
import { inferRegex } from '../src/patterns/index.js';

describe('crm', () => {
  it('aggregates a contact across chats', async () => {
    const s = createMemoryStore();
    await s.put({
      id: 'm1',
      tokens: [],
      sender: 'alice',
      chat: 'c1',
      body: 'hi',
    });
    await s.put({
      id: 'm2',
      tokens: [],
      sender: 'alice',
      chat: 'c2',
      body: 'yo',
    });
    await s.put({
      id: 'm3',
      tokens: [],
      sender: 'bob',
      chat: 'c1',
      body: 'hey',
    });
    const v = await aggregateContact(s, 'alice');
    expect(v.chats.length).toBe(2);
    expect(v.messageCount).toBe(2);
  });
  it('set algebra works', () => {
    const a = [{ id: 'x' }, { id: 'y' }];
    const b = [{ id: 'y' }, { id: 'z' }];
    expect(
      intersect(a, b)
        .map((l) => l.id)
        .join(',')
    ).toBe('y');
    expect(union(a, b).length).toBe(3);
    expect(
      difference(a, b)
        .map((l) => l.id)
        .join(',')
    ).toBe('x');
  });
  it('local search ranks by similarity', async () => {
    const s = createMemoryStore();
    await s.put({ id: 'm1', tokens: [], body: 'hello world' });
    await s.put({ id: 'm2', tokens: [], body: 'goodbye moon' });
    const r = await localSearch(s, { query: 'hello world', min: 0.2 });
    expect(r[0].link.id).toBe('m1');
  });
});

describe('fact extraction', () => {
  it('extracts question/answer pairs', () => {
    const messages = [
      { sender: 'me', body: 'where are you from', timestamp: 1, chat: 'c' },
      { sender: 'alice', body: 'berlin', timestamp: 2, chat: 'c' },
    ];
    const p = { id: 'p1', regex: inferRegex(['where are you from']) };
    const r = extractFacts(messages, [p]);
    expect(r.facts.length).toBe(1);
    expect(r.byAnswerer.alice[0].answer).toBe('berlin');
  });
});
