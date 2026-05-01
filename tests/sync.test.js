import { describe, it, expect } from 'test-anywhere';
import { createMemoryStore } from '../src/storage/index.js';
import { merge, createPeer, loopback, tickVersion } from '../src/sync/index.js';

describe('crdt merge', () => {
  it('picks the higher version on conflict', () => {
    const a = { id: 'x', tokens: ['old'], version: '1-a' };
    const b = { id: 'x', tokens: ['new'], version: '2-a' };
    expect(merge(a, b).tokens[0]).toBe('new');
  });
  it('unions children', () => {
    const a = { id: 'x', children: ['c1'], version: '1' };
    const b = { id: 'x', children: ['c2'], version: '2' };
    expect(new Set(merge(a, b).children).size).toBe(2);
  });
});

describe('peer loopback sync', () => {
  it('replicates puts between two stores', async () => {
    const sa = createMemoryStore();
    const sb = createMemoryStore();
    const pa = createPeer(sa, { node: 'a' });
    const pb = createPeer(sb, { node: 'b' });
    const lp = loopback();
    pa.connect(lp.a);
    pb.connect(lp.b);
    await sa.put({ id: 'k', tokens: ['hello'], version: tickVersion(1, 'a') });
    await lp.settle();
    expect((await sb.get('k')).tokens[0]).toBe('hello');
  });
});
