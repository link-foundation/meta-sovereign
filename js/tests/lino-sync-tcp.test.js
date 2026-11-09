import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import { once } from 'node:events';
import { syncWire, SYNC_PROTOCOL, MAX_SYNC_BYTES } from '../src/sync/wire.js';
import { LINO_BINARY, JSON_MEDIA } from '../src/transport/lino.js';
import {
  createTcpFrameReader,
  createJsonLineReader,
  encodeTcpFrame,
} from '../src/sync/tcp-frame.js';

const { startSyncListener, connectSyncPeer } = await import(
  process.env.TCP_SYNC_TRANSPORT_MODULE || '../src/sync/tcp-transport.js'
);

const record = {
  type: 'put',
  link: {
    id: 'l:tcp',
    body: '你好\r\nПривет 🚀 "quoted"',
    single: [true],
    empty: [],
  },
};
const next = (transport) =>
  new Promise((resolve) => transport.onMessage(resolve));
const raw = async (port) => {
  const socket = net.createConnection({ port, host: '127.0.0.1' });
  socket.on('error', () => {});
  await once(socket, 'connect');
  return socket;
};
const tcpTest = (name, run) => test(name, { timeout: 5000 }, run);

tcpTest(
  'TCP defaults to versioned Lino and delivers queued snapshots after selection',
  async () => {
    const listener = await startSyncListener();
    let socket;
    try {
      const queued = globalThis.structuredClone(record);
      listener.transport.send(queued);
      queued.link.body = 'changed after send';
      socket = await raw(listener.port);
      const [preface] = await once(socket, 'data');
      assert.equal(preface.toString(), `${SYNC_PROTOCOL}\n`);
      const wire = syncWire();
      const received = new Promise((resolve) =>
        socket.on('data', createTcpFrameReader(wire, resolve))
      );
      const incoming = next(listener.transport);
      socket.write(
        Buffer.concat([
          Buffer.from(`${SYNC_PROTOCOL}\n`),
          encodeTcpFrame(wire, record),
        ])
      );
      assert.deepEqual(await received, record);
      assert.deepEqual(await incoming, record);
    } finally {
      socket?.destroy();
      await listener.close();
    }
  }
);

tcpTest(
  'TCP binary peers retain first records before handlers attach and exchange both ways',
  async () => {
    const options = { format: LINO_BINARY };
    const listener = await startSyncListener(options);
    let client;
    try {
      listener.transport.send(record);
      client = await connectSyncPeer({ port: listener.port, ...options });
      assert.deepEqual(await next(client.transport), record);
      const incoming = next(listener.transport);
      client.transport.send(record);
      assert.deepEqual(await incoming, record);
      await client.close();
      assert.throws(() => client.transport.send(record), /not open/);
      await listener.close();
      assert.throws(() => listener.transport.send(record), /closed/);
    } finally {
      await client?.close();
      await listener.close();
    }
  }
);

tcpTest(
  'TCP refuses protocol mismatch and JSON without explicit compatibility',
  async () => {
    const listener = await startSyncListener();
    try {
      await assert.rejects(
        connectSyncPeer({ port: listener.port, format: LINO_BINARY }),
        /protocol/
      );
      await assert.rejects(
        connectSyncPeer({ port: listener.port, format: JSON_MEDIA }),
        /unsupported sync format/
      );
      await assert.rejects(
        startSyncListener({ format: JSON_MEDIA }),
        /unsupported sync format/
      );
      await assert.rejects(
        startSyncListener({ port: listener.port }),
        /EADDRINUSE/
      );
    } finally {
      await listener.close();
    }
  }
);

tcpTest(
  'explicit TCP JSON mode interoperates with legacy newline clients',
  async () => {
    const options = { format: JSON_MEDIA, jsonCompatibility: true };
    const listener = await startSyncListener(options);
    let socket;
    try {
      socket = await raw(listener.port);
      const received = new Promise((resolve) =>
        socket.on('data', createJsonLineReader(syncWire(options), resolve))
      );
      const incoming = next(listener.transport);
      socket.write(`${JSON.stringify(record)}\n`);
      assert.deepEqual(await incoming, record);
      listener.transport.send(record);
      assert.deepEqual(await received, record);
    } finally {
      socket?.destroy();
      await listener.close();
    }
  }
);

tcpTest(
  'default TCP rejects a legacy JSON preface and oversized declared records',
  async () => {
    const failures = [];
    const listener = await startSyncListener({
      onError: (error) => failures.push(error),
    });
    try {
      for (const bytes of [
        Buffer.from(`${JSON.stringify(record)}\n`),
        Buffer.concat([
          Buffer.from(`${SYNC_PROTOCOL}\n`),
          Buffer.from([0, 64, 0, 1]),
        ]),
      ]) {
        const socket = await raw(listener.port);
        const closed = new Promise((resolve) => socket.once('close', resolve));
        socket.resume();
        socket.write(bytes);
        await closed;
      }
      assert.equal(failures.length, 2);
      assert.match(failures[0].message, /protocol/);
      assert.match(failures[1].message, /length/);
      assert.throws(
        () =>
          listener.transport.send({
            type: 'put',
            body: 'x'.repeat(MAX_SYNC_BYTES),
          }),
        /4 MiB/
      );
    } finally {
      await listener.close();
    }
  }
);

tcpTest(
  'TCP framing preserves bytewise UTF-8 and multiple coalesced text/binary records',
  () => {
    for (const options of [
      {},
      { format: LINO_BINARY },
      { format: JSON_MEDIA, jsonCompatibility: true },
    ]) {
      const wire = syncWire(options);
      const received = [];
      const read =
        wire.format === JSON_MEDIA
          ? createJsonLineReader(wire, (event) => received.push(event))
          : createTcpFrameReader(wire, (event) => received.push(event));
      const frame = encodeTcpFrame(wire, record);
      for (const byte of frame) {
        read(Buffer.from([byte]));
      }
      read(Buffer.concat([frame, frame]));
      assert.deepEqual(received, [record, record, record]);
    }
    const read = createTcpFrameReader(syncWire(), () =>
      assert.fail('invalid payload delivered')
    );
    assert.throws(() => read(Buffer.from([0, 64, 0, 1])), /length/);
    assert.throws(
      () =>
        createTcpFrameReader(syncWire(), () => {})(
          Buffer.from([0, 0, 0, 1, 255])
        ),
      /encoded data/
    );
  }
);
