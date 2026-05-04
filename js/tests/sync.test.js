import { describe, it, expect } from 'test-anywhere';
import { createMemoryStore } from '../src/storage/index.js';
import {
  merge,
  createPeer,
  loopback,
  tickVersion,
  vcInit,
  vcTick,
  vcMerge,
  vcCompare,
} from '../src/sync/index.js';

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

describe('vector clocks', () => {
  it('vcCompare detects dominance and concurrency', () => {
    const a = vcTick(vcTick(vcInit(), 'a'), 'a'); // {a: 2}
    const b = vcTick(vcInit(), 'a'); // {a: 1}
    expect(vcCompare(a, b)).toBe(1);
    expect(vcCompare(b, a)).toBe(-1);
    const c = vcTick(vcInit(), 'b'); // {b: 1}
    expect(vcCompare(b, c)).toBe(null); // concurrent
  });
  it('vcMerge takes the per-node max', () => {
    const m = vcMerge({ a: 3, b: 1 }, { a: 2, b: 5, c: 1 });
    expect(m.a).toBe(3);
    expect(m.b).toBe(5);
    expect(m.c).toBe(1);
  });
  it('merge picks the dominant vector clock', () => {
    const a = { id: 'x', body: 'old', vc: { a: 1 } };
    const b = { id: 'x', body: 'new', vc: { a: 2 } };
    expect(merge(a, b).body).toBe('new');
  });
  it('merge uses deterministic tiebreak on concurrent edits', () => {
    const a = { id: 'x', body: 'A', vc: { a: 1 } };
    const b = { id: 'x', body: 'B', vc: { b: 1 } };
    const m1 = merge(a, b);
    const m2 = merge(b, a);
    expect(m1.body).toBe(m2.body);
    expect(m1.vc.a).toBe(1);
    expect(m1.vc.b).toBe(1);
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

  it('disconnects local and remote transport handlers', async () => {
    const store = createMemoryStore();
    const peer = createPeer(store, { node: 'a' });
    const transport = {
      sent: 0,
      offRemote: 0,
      send() {
        this.sent += 1;
      },
      onMessage() {
        return () => {
          this.offRemote += 1;
        };
      },
    };

    const off = peer.connect(transport);
    off();

    await store.put({ id: 'after-disconnect', tokens: ['x'] });
    expect(transport.sent).toBe(0);
    expect(transport.offRemote).toBe(1);
  });
});
