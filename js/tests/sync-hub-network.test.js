import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createPeer } from '../src/sync/peer.js';
import {
  startSyncListener,
  connectSyncPeer,
} from '../src/sync/tcp-transport.js';
import {
  startSyncWebSocketListener,
  connectSyncWebSocket,
} from '../src/sync/ws-transport.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';

const observed = (store, type, id) => {
  let off;
  let timer;
  const promise = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      off();
      reject(new Error(`Missing ${type} at ${id}`));
    }, 2000);
    off = store.subscribe((event) => {
      if (event.type === type && event.link.id === id) {
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

for (const [name, listen, connect, formats] of [
  ['TCP text', startSyncListener, connectSyncPeer, [LINO_TEXT, LINO_TEXT]],
  [
    'TCP binary',
    startSyncListener,
    connectSyncPeer,
    [LINO_BINARY, LINO_BINARY],
  ],
  [
    'WebSocket mixed text/binary',
    startSyncWebSocketListener,
    connectSyncWebSocket,
    [LINO_TEXT, LINO_BINARY],
  ],
]) {
  test(
    `${name}: two clients exchange puts and deletion through one hub`,
    { timeout: 10000 },
    async () => {
      const errors = [];
      const hubStore = createMemoryStore();
      const hub = createPeer(hubStore, {
        hub: true,
        schemaVersion: 7,
        onError: (error) => errors.push(error),
      });
      const listener = await listen({ format: formats[0] });
      const clients = [];
      const detach = [hub.connect(listener.transport)];
      const receipts = [];
      const stores = [];
      try {
        for (const format of formats) {
          const client = await connect({ port: listener.port, format });
          clients.push(client);
          const store = createMemoryStore();
          stores.push(store);
          detach.push(
            createPeer(store, {
              schemaVersion: 7,
              onError: (error) => errors.push(error),
            }).connect(client.transport)
          );
        }
        const exchange = async (from, to, type, id) => {
          const receipt = observed(stores[to], type, id);
          receipts.push(receipt);
          if (type === 'put') {
            await stores[from].put({ id, body: 'three peers', version: '1' });
          } else {
            await stores[from].delete(id);
          }
          await receipt.promise;
        };
        await exchange(0, 1, 'put', 'left');
        await exchange(1, 0, 'put', 'right');
        await exchange(1, 0, 'delete', 'left');
        assert.equal(await hubStore.get('left'), null);
        assert.equal(await stores[0].get('left'), null);
        assert.equal((await stores[0].get('right')).body, 'three peers');
        assert.deepEqual(errors, []);
      } finally {
        receipts.forEach((receipt) => receipt.cancel());
        detach.forEach((off) => off());
        for (const client of clients) {
          await client.close();
        }
        await listener.close();
      }
    }
  );
}
