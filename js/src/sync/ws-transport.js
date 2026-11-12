/**
 * WebSocket sync transport.
 *
 * Mounts on top of an existing http.Server so the SPA can keep its
 * single origin (same port, same /ws path). The transport conforms
 * to the same `{ send, onMessage }` shape used by `loopback` and
 * `tcp-transport`, so `createPeer().connect(transport)` plugs into
 * either substrate without changing the peer code.
 *
 * Browser clients talk to this via the standard global `WebSocket`,
 * so no library code ships into the SPA bundle. Node-side clients
 * use `connectSyncWebSocket` below for cross-process tests.
 */

import net from 'node:net';
import http from 'node:http';
import {
  isWebSocketUpgrade,
  writeAcceptHandshake,
  encodeTextFrame,
  encodeClientTextFrame,
  encodeBinaryFrame,
  encodeClientBinaryFrame,
  encodePongFrame,
  createFrameReader,
  rejectForeignOrigin,
  acceptKey,
} from './ws-frame.js';
import {
  bunAttachSyncWebSocket,
  bunStartSyncWebSocketListener,
} from './bun-server.js';

import { syncWire, negotiateSync, syncQueue } from './wire.js';
import { connectNativeWebSocket } from './websocket-client.js';

const IS_BUN = typeof globalThis.Bun !== 'undefined';
const IS_DENO = typeof globalThis.Deno !== 'undefined' && !IS_BUN;
const frameFor = (wire, event, client = false) => {
  const data = wire.encode(event);
  return wire.binary
    ? (client ? encodeClientBinaryFrame : encodeBinaryFrame)(data)
    : (client ? encodeClientTextFrame : encodeTextFrame)(data);
};
const acceptedBy = (head, expected, protocol) => {
  const lines = head.toString('utf8').split('\r\n');
  const headers = new Map(
    lines.slice(1).map((line) => {
      const colon = line.indexOf(':');
      return [line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()];
    })
  );
  return (
    /^HTTP\/1\.[01] 101(?: |$)/.test(lines[0]) &&
    headers.get('sec-websocket-accept') === expected &&
    headers.get('sec-websocket-protocol') === protocol
  );
};

/**
 * Attach a /ws (or other path) WebSocket sync endpoint to an
 * existing http server. Returns a transport object plus a `close()`
 * that detaches handlers without stopping the server itself.
 */
export const attachSyncWebSocket = (
  server,
  { path = '/ws', verifyOrigin = null, jsonCompatibility = false } = {}
) => {
  if (IS_BUN) {
    return bunAttachSyncWebSocket(server, {
      path,
      verifyOrigin,
      jsonCompatibility,
    });
  }
  const sockets = new Map();
  const handlers = new Set();
  const pending = syncQueue();

  const onUpgrade = (req, socket) => {
    const reqPath = (req.url ?? '').split('?')[0];
    if (reqPath !== path) {
      // Another upgrade handler may own this path; if no one claims it
      // the socket will idle out — but here we conservatively close it
      // only if no other listeners are present.
      if (server.listenerCount('upgrade') === 1) {
        socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
        socket.destroy();
      }
      return;
    }
    if (rejectForeignOrigin(req, socket, verifyOrigin)) {
      return;
    }
    if (!isWebSocketUpgrade(req)) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }
    const selected = negotiateSync(req.headers['sec-websocket-protocol'], {
      jsonCompatibility,
    });
    if (!selected) {
      socket.end('HTTP/1.1 406 Not Acceptable\r\nConnection: close\r\n\r\n');
      return;
    }
    const { wire, protocol } = selected;
    writeAcceptHandshake(socket, req, protocol);
    sockets.set(socket, wire);
    try {
      pending.drain((event) => socket.write(frameFor(wire, event)));
    } catch {
      sockets.delete(socket);
      socket.destroy();
      return;
    }
    const receive = (data) => {
      let event;
      try {
        event = wire.decode(data);
      } catch {
        socket.destroy();
        return;
      }
      for (const handler of handlers) {
        handler(event);
      }
    };
    const reader = createFrameReader({
      onText: receive,
      onBinary: receive,
      onClose: () => {
        sockets.delete(socket);
        socket.destroy();
      },
      onPing: (payload) => socket.write(encodePongFrame(payload)),
    });
    socket.on('data', reader);
    socket.on('end', () => {
      sockets.delete(socket);
      socket.destroy();
    });
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => sockets.delete(socket));
  };

  server.on('upgrade', onUpgrade);

  return {
    transport: {
      send: (event) => {
        if (sockets.size === 0) {
          pending.push(event);
          return;
        }
        for (const [socket, wire] of sockets) {
          socket.write(frameFor(wire, event));
        }
      },
      onMessage: (h) => {
        handlers.add(h);
        return () => handlers.delete(h);
      },
    },
    close: () => {
      server.removeListener('upgrade', onUpgrade);
      pending.clear();
      for (const s of sockets.keys()) {
        s.destroy();
      }
      sockets.clear();
      handlers.clear();
    },
    socketCount: () => sockets.size,
  };
};

/**
 * Stand-alone WebSocket sync server: convenience wrapper that boots
 * a tiny http server and attaches the sync endpoint. Used by tests
 * and by the `meta-sovereign sync-ws-listen` CLI subcommand.
 */
export const startSyncWebSocketListener = ({
  port = 0,
  path = '/ws',
  jsonCompatibility = false,
} = {}) => {
  if (IS_BUN) {
    return bunStartSyncWebSocketListener({ port, path, jsonCompatibility });
  }
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('meta-sovereign sync ws');
    });
    const handle = attachSyncWebSocket(server, { path, jsonCompatibility });
    server.listen(port, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        transport: handle.transport,
        path,
        close: () =>
          new Promise((r) => {
            handle.close();
            server.close(() => r());
          }),
      });
    });
  });
};

/**
 * Node-side WebSocket sync client. Performs the RFC 6455 client
 * handshake by hand, then exposes the same `{ send, onMessage }`
 * shape as the other transports.
 */
export const connectSyncWebSocket = ({
  port,
  host = '127.0.0.1',
  path = '/ws',
  ...options
}) => {
  const wire = syncWire(options);
  if (IS_BUN || (IS_DENO && typeof globalThis.WebSocket === 'function')) {
    return connectNativeWebSocket({
      url: `ws://${host}:${port}${path}`,
      ...options,
    });
  }
  return new Promise((resolve, reject) => {
    const handlers = new Set();
    let settled = false;
    const fail = (err) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(err);
    };
    const socket = net.createConnection({ port, host }, () => {
      const key = Buffer.from(
        Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
      ).toString('base64');
      socket.write(
        [
          `GET ${path} HTTP/1.1`,
          `Host: ${host}:${port}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${key}`,
          'Sec-WebSocket-Version: 13',
          `Sec-WebSocket-Protocol: ${wire.protocol}`,
          '',
          '',
        ].join('\r\n')
      );
      const expected = acceptKey(key);
      let handshake = Buffer.alloc(0);
      let upgraded = false;
      const receive = (data) => {
        let event;
        try {
          event = wire.decode(data);
        } catch {
          socket.destroy();
          return;
        }
        for (const handler of handlers) {
          handler(event);
        }
      };
      const reader = createFrameReader({
        onText: (text) => receive(text),
        onBinary: (bytes) => receive(bytes),
        onClose: () => socket.destroy(),
        onPing: (payload) => socket.write(encodePongFrame(payload, true)),
      });
      socket.on('data', (chunk) => {
        if (!upgraded) {
          handshake = Buffer.concat([handshake, chunk]);
          const idx = handshake.indexOf('\r\n\r\n');
          if (idx === -1) {
            if (handshake.length > 16 * 1024) {
              fail(new Error('oversized websocket handshake'));
              socket.destroy();
            }
            return;
          }
          if (
            idx > 16 * 1024 ||
            !acceptedBy(handshake.subarray(0, idx), expected, wire.protocol)
          ) {
            fail(new Error('websocket handshake rejected'));
            socket.destroy();
            return;
          }
          upgraded = true;
          settled = true;
          const tail = handshake.subarray(idx + 4);
          handshake = Buffer.alloc(0);
          resolve({
            transport: {
              send: (event) => {
                if (socket.destroyed || socket.writableEnded) {
                  throw new Error('websocket is closed');
                }
                socket.write(frameFor(wire, event, true));
              },
              onMessage: (h) => {
                handlers.add(h);
                return () => handlers.delete(h);
              },
            },
            close: () =>
              new Promise((r) => {
                if (socket.destroyed) {
                  r();
                  return;
                }
                socket.once('close', r);
                socket.destroy();
              }),
          });
          if (tail.length) {
            // After the caller had its turn to listen.
            globalThis.queueMicrotask(() => reader(tail));
          }
          return;
        }
        reader(chunk);
      });
      socket.on('close', () =>
        fail(new Error('websocket closed before handshake'))
      );
    });
    socket.on('error', fail);
  });
};
