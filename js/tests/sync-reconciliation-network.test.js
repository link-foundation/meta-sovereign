import test from 'node:test';
import assert from 'node:assert/strict';
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
import { causalMemory, waitReconciled } from './helpers/reconciliation.mjs';

for (const [name, listen, connect, formats] of [
  ['TCP text', startSyncListener, connectSyncPeer, [LINO_TEXT, LINO_TEXT]],
  [
    'TCP binary',
    startSyncListener,
    connectSyncPeer,
    [LINO_BINARY, LINO_BINARY],
  ],
  [
    'WebSocket mixed',
    startSyncWebSocketListener,
    connectSyncWebSocket,
    [LINO_TEXT, LINO_BINARY],
  ],
]) {
  test(
    `${name}: a later client catches up through a shared hub`,
    { timeout: 10000 },
    async () => {
      const errors = [];
      const options = {
        schemaVersion: 13,
        onError: (error) => errors.push(error),
      };
      const hub = causalMemory('hub');
      await hub.put({ id: 'server-before-connect', body: 'offline server' });
      await hub.put({ id: 'secret:hub', value: 'never transfer' });
      const listener = await listen({ format: formats[0] });
      const stops = [
        createPeer(hub, { ...options, hub: true }).connect(listener.transport),
      ];
      const clients = [];
      const stores = [];
      try {
        for (const [index, format] of formats.entries()) {
          const store = causalMemory(`client-${index}`);
          await store.put({
            id: `client-${index}-before`,
            body: 'offline client',
          });
          stores.push(store);
          const client = await connect({ port: listener.port, format });
          clients.push(client);
          stops.push(createPeer(store, options).connect(client.transport));
          await waitReconciled(
            async () =>
              (await store.get('server-before-connect')) &&
              (await hub.get(`client-${index}-before`))
          );
        }
        await waitReconciled(
          async () =>
            (await stores[1].get('client-0-before')) &&
            (await stores[0].get('client-1-before'))
        );
        for (const store of stores) {
          assert.equal(
            (await store.get('server-before-connect')).body,
            'offline server'
          );
          assert.equal(await store.get('secret:hub'), null);
        }
        assert.deepEqual(errors, []);
      } finally {
        stops.forEach((stop) => stop());
        for (const client of clients) {
          await client.close();
        }
        await listener.close();
      }
    }
  );
}
