import { describe, it, expect } from 'test-anywhere';
import { evalAudience, parseAudience } from '../src/crm/audience.js';

const seed = [
  {
    id: 'msg:telegram:1',
    source: 'telegram',
    chat: 'general',
    sender: 'alice',
    body: 'hello world',
    timestamp: '2024-01-01T00:00:00Z',
    facts: ['speaks_english'],
  },
  {
    id: 'msg:telegram:2',
    source: 'telegram',
    chat: 'general',
    sender: 'me',
    body: 'привет всем',
    timestamp: '2024-02-01T00:00:00Z',
    facts: ['speaks_russian'],
  },
  {
    id: 'msg:vk:3',
    source: 'vk',
    chat: 'wall',
    sender: 'bob',
    body: 'random',
    timestamp: '2024-03-01T00:00:00Z',
    facts: [],
  },
  {
    id: 'pattern:hello',
    source: 'pattern',
    body: 'hello',
  },
];

describe('audience DSL', () => {
  it('filters by network', () => {
    const r = evalAudience(seed, 'network:telegram');
    expect(r.length).toBe(2);
  });
  it('combines AND / OR / NOT', () => {
    const r = evalAudience(
      seed,
      '(network:telegram OR network:vk) AND NOT sender:me'
    );
    expect(
      r
        .map((l) => l.id)
        .sort()
        .join(',')
    ).toBe('msg:telegram:1,msg:vk:3');
  });
  it('matches body substring (case-insensitive)', () => {
    const r = evalAudience(seed, 'body:HELLO');
    expect(
      r
        .map((l) => l.id)
        .sort()
        .join(',')
    ).toBe('msg:telegram:1,pattern:hello');
  });
  it('filters by since timestamp', () => {
    const r = evalAudience(seed, 'kind:msg AND since:2024-02-01');
    expect(
      r
        .map((l) => l.id)
        .sort()
        .join(',')
    ).toBe('msg:telegram:2,msg:vk:3');
  });
  it('filters by before timestamp', () => {
    const r = evalAudience(seed, 'kind:msg AND before:2024-02-01');
    expect(r.length).toBe(1);
    expect(r[0].id).toBe('msg:telegram:1');
  });
  it('matches the bare "me" predicate', () => {
    const r = evalAudience(seed, 'me');
    expect(r.length).toBe(1);
    expect(r[0].sender).toBe('me');
  });
  it('matches by fact substring', () => {
    const r = evalAudience(seed, 'fact:russian');
    expect(r.length).toBe(1);
    expect(r[0].sender).toBe('me');
  });
  it('parses to an AST without throwing on empty input', () => {
    const ast = parseAudience('');
    expect(ast.kind).toBe('set');
  });
});
