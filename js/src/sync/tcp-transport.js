/** Versioned, bounded Lino sync over loopback TCP. JSON is explicit legacy mode. */
import net from 'node:net';
import { setTimeout, clearTimeout } from 'node:timers';
import { JSON_MEDIA, WireError } from '../transport/lino.js';
import { syncWire, syncQueue, MAX_SYNC_BYTES } from './wire.js';
import {
  createTcpFrameReader,
  createJsonLineReader,
  encodeTcpFrame,
} from './tcp-frame.js';

const messages = () => {
  const handlers = new Set();
  const inbox = syncQueue();
  return {
    receive(event) {
      if (handlers.size === 0) {
        inbox.push(event);
      } else {
        for (const handler of handlers) {
          handler(event);
        }
      }
    },
    onMessage(handler) {
      handlers.add(handler);
      inbox.drain(handler);
      return () => handlers.delete(handler);
    },
    clear() {
      handlers.clear();
      inbox.clear();
    },
  };
};

const connection = (socket, wire, { onReady, onMessage, onError }) => {
  const legacy = wire.format === JSON_MEDIA;
  let ready = legacy;
  let preface = Buffer.alloc(0);
  let timer;
  let closed = false;
  let resolveClose;
  const closing = new Promise((resolve) => {
    resolveClose = resolve;
  });
  const fail = (error) => {
    if (closed) {
      return;
    }
    onError(error);
    socket.destroy();
  };
  let read = legacy
    ? createJsonLineReader(wire, onMessage)
    : createTcpFrameReader(wire, onMessage);
  socket.on('error', fail);
  socket.once('close', () => {
    closed = true;
    read = preface = null;
    clearTimeout(timer);
    resolveClose();
  });
  socket.on('data', (chunk) => {
    if (closed || socket.destroyed) {
      return;
    }
    try {
      if (!ready) {
        const newline = chunk.indexOf(10);
        const end = newline < 0 ? chunk.length : newline;
        if (preface.length + end > 128) {
          throw new WireError(
            'TCP sync protocol preface exceeds 128 bytes',
            'too-large'
          );
        }
        preface = Buffer.concat([preface, chunk.subarray(0, end)]);
        if (newline < 0) {
          return;
        }
        if (!preface.equals(Buffer.from(wire.protocol))) {
          throw new WireError(
            'TCP sync protocol mismatch',
            'unsupported-media'
          );
        }
        preface = null;
        ready = true;
        clearTimeout(timer);
        onReady();
        chunk = chunk.subarray(newline + 1);
      }
      read(chunk);
    } catch (error) {
      fail(error);
    }
  });
  const start = () => {
    try {
      if (legacy) {
        onReady();
      } else {
        socket.write(`${wire.protocol}\n`);
        timer = setTimeout(
          () =>
            fail(
              new WireError(
                'TCP sync protocol handshake timed out',
                'protocol-timeout'
              )
            ),
          10_000
        );
        timer.unref?.();
      }
    } catch (error) {
      fail(error);
    }
  };
  return {
    start,
    closed: closing,
    get ready() {
      return ready && !closed && !socket.destroyed;
    },
    send(event) {
      if (!ready || closed || socket.destroyed) {
        throw new WireError(
          'TCP sync connection is not open',
          'connection-closed'
        );
      }
      const data = encodeTcpFrame(wire, event);
      if (socket.writableLength + data.length > MAX_SYNC_BYTES + 4) {
        throw new WireError('TCP sync write queue exceeds 4 MiB', 'too-large');
      }
      socket.write(data);
    },
    close() {
      socket.destroy();
      return closing;
    },
  };
};

export const startSyncListener = async ({
  port = 0,
  onError = () => {},
  ...options
} = {}) => {
  const wire = syncWire(options);
  const hub = messages();
  const peers = new Set();
  const pending = syncQueue();
  let stopped = false;
  let closingTask;
  const server = net.createServer((socket) => {
    if (stopped) {
      socket.destroy();
      return;
    }
    const peer = connection(socket, wire, {
      onMessage: hub.receive,
      onReady: () => pending.drain((event) => peer.send(event)),
      onError,
    });
    peers.add(peer);
    socket.once('close', () => peers.delete(peer));
    peer.start();
  });
  await new Promise((resolve, reject) => {
    const failed = (error) => {
      server.off('listening', listening);
      reject(error);
    };
    const listening = () => {
      server.off('error', failed);
      resolve();
    };
    server.once('error', failed);
    server.once('listening', listening);
    server.listen(port, '127.0.0.1');
  });
  server.on('error', onError);
  return {
    port: server.address().port,
    protocol: wire.protocol,
    transport: {
      send(event) {
        if (stopped) {
          throw new WireError(
            'TCP sync listener is closed',
            'connection-closed'
          );
        }
        const active = [...peers].filter((peer) => peer.ready);
        if (active.length === 0) {
          pending.push(event);
          return;
        }
        for (const peer of active) {
          peer.send(event);
        }
      },
      onMessage: hub.onMessage,
    },
    close() {
      closingTask ??= (async () => {
        stopped = true;
        pending.clear();
        hub.clear();
        const closing = [...peers].map((peer) => peer.close());
        await new Promise((resolve) => server.close(resolve));
        await Promise.all(closing);
      })();
      return closingTask;
    },
  };
};

export const connectSyncPeer = async ({
  port,
  host = '127.0.0.1',
  onError = () => {},
  ...options
} = {}) => {
  const wire = syncWire(options);
  const hub = messages();
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host });
    let settled = false;
    const peer = connection(socket, wire, {
      onMessage: hub.receive,
      onReady: () => {
        settled = true;
        resolve({
          protocol: wire.protocol,
          closed: peer.closed,
          transport: {
            send: (event) => peer.send(event),
            onMessage: hub.onMessage,
          },
          close: () => {
            hub.clear();
            return peer.close();
          },
        });
      },
      onError: (error) => {
        if (!settled) {
          reject(error);
        } else {
          onError(error);
        }
      },
    });
    socket.once('connect', peer.start);
    socket.once('close', () => {
      if (!settled) {
        reject(
          new WireError(
            'TCP sync closed before protocol selection',
            'connection-closed'
          )
        );
      }
    });
  });
};
