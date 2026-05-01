import { describe, it, expect } from 'test-anywhere';
import {
  createPeer,
  startSyncListener,
  connectSyncPeer,
} from '../src/sync/index.js';
import { createMemoryStore } from '../src/storage/index.js';

describe('sync over TCP transport', () => {
  it('replicates a put from one store to another', async () => {
    const a = createMemoryStore();
    const b = createMemoryStore();
    const peerA = createPeer(a, { node: 'a' });
    const peerB = createPeer(b, { node: 'b' });

    const listener = await startSyncListener({ port: 0 });
    const offA = peerA.connect(listener.transport);

    const client = await connectSyncPeer({ port: listener.port });
    const offB = peerB.connect(client.transport);

    await a.put({
      id: 'x',
      tokens: ['hello'],
      vc: { a: 1 },
    });

    // Allow the TCP roundtrip + async receive() to settle.
    await new Promise((r) => setTimeout(r, 80));

    const replicated = await b.get('x');
    expect(replicated?.tokens?.[0]).toBe('hello');

    offA();
    offB();
    await client.close();
    await listener.close();
  });
});
