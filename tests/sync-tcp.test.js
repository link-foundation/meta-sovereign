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

    // Subscribe to store B before the put so we get a deterministic
    // signal when replication arrives — avoids a race against bun's
    // 5-second test timeout on slower CI runners (notably macOS).
    const replicatedSignal = new Promise((resolve) => {
      const off = b.subscribe((event) => {
        if (event.type === 'put' && event.link.id === 'x') {
          off();
          resolve(event.link);
        }
      });
    });

    await a.put({
      id: 'x',
      tokens: ['hello'],
      vc: { a: 1 },
    });

    const replicated = await replicatedSignal;
    expect(replicated?.tokens?.[0]).toBe('hello');

    offA();
    offB();
    await client.close();
    await listener.close();
  });
});
