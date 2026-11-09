const { WebSocket } = globalThis;

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  startSyncWebSocketListener,
  connectSyncWebSocket,
} from '../src/sync/ws-transport.js';
import {
  encodeWire,
  decodeWire,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';

const TEXT_PROTOCOL = 'meta-sovereign-sync.lino.v2';
const BINARY_PROTOCOL = 'meta-sovereign-sync.lino-binary.v2';
const JSON_PROTOCOL = 'meta-sovereign-sync.v1';
const sample = {
  type: 'put',
  link: {
    id: 'l:юникод',
    tokens: ['quotes "\'\\', 'one\r\ntwo', '🚀'],
    empty: [],
    single: [true],
    absent: null,
    n: 42,
  },
};
const opened = (socket) =>
  new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener(
      'error',
      () => reject(new Error('handshake rejected')),
      { once: true }
    );
  });
const nextMessage = (socket) =>
  new Promise((resolve) =>
    socket.addEventListener('message', resolve, { once: true })
  );
const connect = async (url, protocol) => {
  const socket = new WebSocket(url, protocol);
  socket.binaryType = 'arraybuffer';
  const message = nextMessage(socket);
  await opened(socket);
  return { socket, message };
};
const stop = async (socket) => {
  if (!socket || socket.readyState === WebSocket.CLOSED) {
    return;
  }
  const closed = new Promise((resolve) =>
    socket.addEventListener('close', resolve, { once: true })
  );
  socket.close();
  await closed;
};

test(
  'unnegotiated sync defaults to Lino text in both directions',
  { timeout: 5000 },
  async () => {
    const listener = await startSyncWebSocketListener();
    let socket;
    try {
      listener.transport.send(sample);
      const connection = await connect(`ws://127.0.0.1:${listener.port}/ws`);
      socket = connection.socket;
      const incoming = (await connection.message).data;
      assert.equal(typeof incoming, 'string');
      assert.deepEqual(decodeWire(incoming, LINO_TEXT), sample);
      const received = new Promise((resolve) =>
        listener.transport.onMessage(resolve)
      );
      socket.send(encodeWire(sample, LINO_TEXT));
      assert.deepEqual(await received, sample);
    } finally {
      await stop(socket);
      await listener.close();
    }
  }
);

test(
  'sync negotiates text and binary peers and encodes broadcasts for each',
  { timeout: 5000 },
  async () => {
    const listener = await startSyncWebSocketListener();
    const sockets = [];
    try {
      for (const [protocol, type] of [
        [TEXT_PROTOCOL, LINO_TEXT],
        [BINARY_PROTOCOL, LINO_BINARY],
      ]) {
        const connection = await connect(
          `ws://127.0.0.1:${listener.port}/ws`,
          protocol
        );
        sockets.push(connection.socket);
        assert.equal(connection.socket.protocol, protocol);
        listener.transport.send(sample);
        const data = (await connection.message).data;
        assert.equal(typeof data === 'string', type === LINO_TEXT);
        assert.deepEqual(decodeWire(data, type), sample);
        const received = new Promise((resolve) =>
          listener.transport.onMessage(resolve)
        );
        connection.socket.send(encodeWire(sample, type));
        assert.deepEqual(await received, sample);
      }
      const messages = sockets.map(nextMessage);
      listener.transport.send(sample);
      for (const [index, type] of [LINO_TEXT, LINO_BINARY].entries()) {
        assert.deepEqual(
          decodeWire((await messages[index]).data, type),
          sample
        );
      }
    } finally {
      for (const socket of sockets) {
        await stop(socket);
      }
      await listener.close();
    }
  }
);

test(
  'portable sync clients exchange binary frames and reject sends after close',
  { timeout: 5000 },
  async () => {
    const listener = await startSyncWebSocketListener();
    let client;
    try {
      client = await connectSyncWebSocket({
        port: listener.port,
        format: LINO_BINARY,
      });
      const incoming = new Promise((resolve) =>
        client.transport.onMessage(resolve)
      );
      listener.transport.send(sample);
      assert.deepEqual(await incoming, sample);
      const received = new Promise((resolve) =>
        listener.transport.onMessage(resolve)
      );
      client.transport.send(sample);
      assert.deepEqual(await received, sample);
      await client.close();
      assert.throws(() => client.transport.send(sample), /closed/);
    } finally {
      await client?.close();
      await listener.close();
    }
  }
);

test(
  'JSON sync requires an explicit server compatibility switch',
  { timeout: 5000 },
  async () => {
    for (const jsonCompatibility of [false, true]) {
      const listener = await startSyncWebSocketListener({ jsonCompatibility });
      let socket;
      try {
        socket = new WebSocket(
          `ws://127.0.0.1:${listener.port}/ws`,
          JSON_PROTOCOL
        );
        if (!jsonCompatibility) {
          await assert.rejects(opened(socket));
        } else {
          const message = nextMessage(socket);
          await opened(socket);
          assert.equal(socket.protocol, JSON_PROTOCOL);
          listener.transport.send(sample);
          assert.deepEqual(JSON.parse((await message).data), sample);
          const received = new Promise((resolve) =>
            listener.transport.onMessage(resolve)
          );
          socket.send(JSON.stringify(sample));
          assert.deepEqual(await received, sample);
        }
      } finally {
        await stop(socket);
        await listener.close();
      }
    }
  }
);
