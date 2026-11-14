import { CURRENT_SCHEMA } from '../../js/src/storage/migrations/index.js';
// Real JS peer, official Lino codecs and owned native process/restart.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { nativeServer } from './native-server.mjs';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { withCausalWrites } from '../../js/src/storage/causal-writes.js';
import { createPeer } from '../../js/src/sync/peer.js';
import { connectSyncWebSocket } from '../../js/src/sync/ws-transport.js';
import {
  encodeWire,
  readWireResponse,
  LINO_BINARY,
  LINO_TEXT,
} from '../../js/src/transport/lino.js';

const fixture = async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ms-native-sync-'));
  const binary = resolve(
    process.argv[2] ?? 'rust/target/debug/meta-sovereign-rs'
  );
  const store = withCausalWrites(createMemoryStore(), {
    actor: 'javascript',
  });
  await store.put({
    id: 'offline-js',
    body: ['before connect', { unicode: 'Привет 🚀' }],
  });
  await store.put({ id: 'secret:local', body: 'never replicated' });
  await store.put({ id: 'meta:schema', version: CURRENT_SCHEMA });
  let running;
  const connections = new Set();
  const errors = [];
  const start = async () => {
    running = await nativeServer(t, binary, { cwd: directory });
  };
  const request = (path, method = 'GET', value) =>
    fetch(`${running.base}${path}`, {
      method,
      signal: t.signal,
      headers: { accept: LINO_BINARY, 'content-type': LINO_BINARY },
      ...(value ? { body: encodeWire(value, LINO_BINARY) } : {}),
    });
  const connect = async (source = store, format = LINO_BINARY) => {
    const network = await connectSyncWebSocket({
      port: Number(new URL(running.base).port),
      format,
    });
    const complete = Promise.withResolvers();
    const timer = setTimeout(
      () =>
        complete.reject(
          new Error(
            'native CLI did not reconcile current-schema JavaScript peer'
          )
        ),
      5000
    );
    const onAbort = () => complete.reject(t.signal.reason);
    t.signal.addEventListener('abort', onAbort, { once: true });
    const disconnect = createPeer(source, {
      schemaVersion: CURRENT_SCHEMA,
      reconciliation: { timeoutMs: 5000 },
      onError: (error) => {
        errors.push(error);
        complete.reject(error);
      },
      onState: (state) => {
        if (state.phase === 'reconcile-complete') {
          complete.resolve();
        }
      },
    }).connect(network.transport);
    const connection = { network, disconnect };
    connections.add(connection);
    try {
      await complete.promise;
      return connection;
    } finally {
      clearTimeout(timer);
      t.signal.removeEventListener('abort', onAbort);
    }
  };
  const close = async () => {
    for (const connection of connections) {
      connection.disconnect();
      await connection.network.close();
      connections.delete(connection);
    }
  };
  const until = async (predicate, message) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await predicate()) {
        return;
      }
      await delay(25, undefined, { signal: t.signal });
    }
    assert.fail(message);
  };
  const nativeBody = async (id) => {
    const response = await request(`/links/${id}`);
    const record = await readWireResponse(response);
    return response.ok ? record.body : null;
  };
  return {
    store,
    errors,
    start,
    request,
    connect,
    close,
    until,
    nativeBody,
    stop: async () => running?.stop(),
    dispose: async () => {
      await close();
      await running?.stop();
      await rm(directory, { recursive: true, force: true });
    },
  };
};

test(
  'native CLI reconciles real JavaScript peers across durable restart',
  { timeout: 30_000 },
  async (t) => {
    const {
      store,
      errors,
      start,
      request,
      connect,
      close,
      until,
      nativeBody,
      stop,
      dispose,
    } = await fixture(t);
    try {
      await start();
      const admitted = await request('/links', 'PUT', {
        id: 'offline-native',
        body: 'written before JS connects',
      });
      assert.equal(admitted.status, 200);
      const native = await readWireResponse(admitted);
      await connect();
      assert.deepEqual(await store.get('offline-native'), native);
      const remote = await request('/links/offline-js');
      assert.equal(
        remote.status,
        200,
        'native WebSocket applies the acknowledged JS record'
      );
      assert.deepEqual(
        await readWireResponse(remote),
        await store.get('offline-js')
      );
      assert.equal((await request('/links/secret%3Alocal')).status, 404);
      assert.equal((await request('/links/meta%3Aschema')).status, 404);
      const second = withCausalWrites(createMemoryStore(), {
        actor: 'second-javascript',
      });
      await connect(second, LINO_TEXT);
      assert.deepEqual(
        await second.get('offline-js'),
        await store.get('offline-js')
      );
      const ownerLive = await request('/links', 'PUT', {
        id: 'owner-live',
        body: 'native owner fan-out',
      });
      assert.equal(ownerLive.status, 200);
      await readWireResponse(ownerLive);
      await until(
        async () =>
          (await store.get('owner-live'))?.body === 'native owner fan-out' &&
          (await second.get('owner-live'))?.body === 'native owner fan-out',
        'native owner changes reach both peers'
      );
      await store.put({
        id: 'first-live',
        body: 'binary peer to native and text peer',
      });
      await until(
        async () =>
          (await second.get('first-live'))?.body ===
            'binary peer to native and text peer' &&
          (await nativeBody('first-live')) ===
            'binary peer to native and text peer',
        'remote admission fans out to another peer'
      );
      await second.put({
        id: 'second-live',
        body: 'text peer to native and binary peer',
      });
      await until(
        async () =>
          (await store.get('second-live'))?.body ===
            'text peer to native and binary peer' &&
          (await nativeBody('second-live')) ===
            'text peer to native and binary peer',
        'reverse live admission reaches native and peer'
      );
      const deleted = await request('/links/owner-live', 'DELETE');
      assert.equal(deleted.status, 200);
      await readWireResponse(deleted);
      await until(
        async () =>
          !(await store.get('owner-live')) && !(await second.get('owner-live')),
        'owner deletion reaches both peers'
      );
      await store.delete('first-live');
      await until(
        async () =>
          !(await second.get('first-live')) &&
          (await nativeBody('first-live')) === null,
        'remote deletion reaches native and another peer'
      );
      await close();
      await stop();
      await store.delete('offline-js');
      await store.put({
        id: 'offline-native',
        body: 'edited while disconnected',
      });
      await start();
      await connect();
      assert.equal((await request('/links/offline-js')).status, 404);
      assert.equal(
        (await readWireResponse(await request('/links/offline-native'))).body,
        'edited while disconnected'
      );
      assert.equal((await request('/links/owner-live')).status, 404);
      assert.equal((await request('/links/first-live')).status, 404);
      assert.equal(
        await nativeBody('second-live'),
        'text peer to native and binary peer'
      );
      await close();
      await stop();
      await start();
      assert.equal((await request('/links/offline-js')).status, 404);
      assert.equal(
        (await readWireResponse(await request('/links/offline-native'))).body,
        'edited while disconnected'
      );
      assert.deepEqual(errors, []);
    } finally {
      await dispose();
    }
  }
);
