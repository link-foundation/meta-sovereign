import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createPeer, merge } from '../src/sync/peer.js';
import { SYNC_STAMP } from '../src/sync/register.js';
import {
  startSyncListener,
  connectSyncPeer,
} from '../src/sync/tcp-transport.js';
import {
  startSyncWebSocketListener,
  connectSyncWebSocket,
} from '../src/sync/ws-transport.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';

const observe = (store) => {
  let off;
  let timer;
  const promise = new Promise((resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error('Missing synchronized record')),
      2000
    );
    off = store.subscribe((event) => {
      if (event.type === 'put' && event.link.id === 'shared') {
        clearTimeout(timer);
        off();
        resolve();
      }
    });
  });
  return {
    promise,
    cancel() {
      clearTimeout(timer);
      off();
    },
  };
};

for (const [name, listen, connect, format] of [
  ['TCP text', startSyncListener, connectSyncPeer, LINO_TEXT],
  ['TCP binary', startSyncListener, connectSyncPeer, LINO_BINARY],
  [
    'WebSocket mixed',
    startSyncWebSocketListener,
    connectSyncWebSocket,
    LINO_BINARY,
  ],
]) {
  test(
    `${name}: a joined snapshot retains its original write rank`,
    { timeout: 10000 },
    async () => {
      const [a, b, c] = [
        { id: 'shared', body: 'A', vc: { a: 2 } },
        { id: 'shared', body: 'B', vc: { b: 1 } },
        { id: 'shared', body: 'C', vc: { a: 1, b: 1 } },
      ];
      const server = createMemoryStore();
      const client = createMemoryStore();
      await server.put(merge(a, b));
      await client.put(c);
      const errors = [];
      const options = {
        schemaVersion: 11,
        onError: (error) => errors.push(error),
      };
      const listener = await listen({
        format: listen === startSyncListener ? format : LINO_TEXT,
      });
      const off = [
        createPeer(server, { ...options, hub: true }).connect(
          listener.transport
        ),
      ];
      let connection;
      const receipts = [];
      try {
        connection = await connect({ port: listener.port, format });
        off.push(createPeer(client, options).connect(connection.transport));
        const first = observe(server);
        receipts.push(first);
        await client.put(c);
        await first.promise;
        const second = observe(client);
        receipts.push(second);
        await server.put(await server.get('shared'));
        await second.promise;
        const expected = merge(a, merge(b, c));
        assert.equal(expected.body, 'A');
        assert.deepEqual(await client.get('shared'), expected);
        assert.deepEqual(await server.get('shared'), expected);
        assert.deepEqual(expected[SYNC_STAMP].clock, { a: 2 });
        assert.deepEqual(errors, []);
      } finally {
        receipts.forEach((receipt) => receipt.cancel());
        off.forEach((detach) => detach());
        await connection?.close();
        await listener.close();
      }
    }
  );
}
