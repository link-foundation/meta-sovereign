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
  createFrameReader,
  acceptKey,
} from './ws-frame.js';
import {
  bunAttachSyncWebSocket,
  bunStartSyncWebSocketListener,
  bunConnectSyncWebSocket,
} from './bun-server.js';

const PROTOCOL = 'meta-sovereign-sync.v1';

const IS_BUN = typeof globalThis.Bun !== 'undefined';

const broadcast = (sockets, text) => {
  const frame = encodeTextFrame(text);
  for (const s of sockets) {
    s.write(frame);
  }
};

/**
 * Attach a /ws (or other path) WebSocket sync endpoint to an
 * existing http server. Returns a transport object plus a `close()`
 * that detaches handlers without stopping the server itself.
 */
export const attachSyncWebSocket = (server, { path = '/ws' } = {}) => {
  if (IS_BUN) {
    return bunAttachSyncWebSocket(server, { path });
  }
  const sockets = new Set();
  const handlers = new Set();
  const pending = [];

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
    if (!isWebSocketUpgrade(req)) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }
    writeAcceptHandshake(socket, req);
    sockets.add(socket);
    while (pending.length) {
      const text = pending.shift();
      socket.write(encodeTextFrame(text));
    }
    const reader = createFrameReader({
      onText: (text) => {
        try {
          const event = JSON.parse(text);
          for (const h of handlers) {
            h(event);
          }
        } catch {
          // ignore malformed frames; the protocol is fault-tolerant.
        }
      },
      onClose: () => {
        sockets.delete(socket);
        socket.destroy();
      },
      onPing: () => {
        // pong with empty payload (opcode 0xA, FIN, no mask)
        socket.write(Buffer.from([0x8a, 0x00]));
      },
    });
    socket.on('data', reader);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => sockets.delete(socket));
  };

  server.on('upgrade', onUpgrade);

  return {
    transport: {
      send: (event) => {
        const text = JSON.stringify(event);
        if (sockets.size === 0) {
          pending.push(text);
          return;
        }
        broadcast(sockets, text);
      },
      onMessage: (h) => {
        handlers.add(h);
        return () => handlers.delete(h);
      },
    },
    close: () => {
      server.removeListener('upgrade', onUpgrade);
      for (const s of sockets) {
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
export const startSyncWebSocketListener = ({ port = 0, path = '/ws' } = {}) => {
  if (IS_BUN) {
    return bunStartSyncWebSocketListener({ port, path });
  }
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('meta-sovereign sync ws');
    });
    const handle = attachSyncWebSocket(server, { path });
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
}) => {
  if (IS_BUN) {
    return bunConnectSyncWebSocket({ port, host, path });
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
          `Sec-WebSocket-Protocol: ${PROTOCOL}`,
          '',
          '',
        ].join('\r\n')
      );
      const expected = acceptKey(key);
      let handshake = '';
      let upgraded = false;
      const reader = createFrameReader({
        onText: (text) => {
          try {
            const event = JSON.parse(text);
            for (const h of handlers) {
              h(event);
            }
          } catch {
            // ignore
          }
        },
      });
      socket.on('data', (chunk) => {
        if (!upgraded) {
          handshake += chunk.toString('utf8');
          const idx = handshake.indexOf('\r\n\r\n');
          if (idx === -1) {
            return;
          }
          if (!handshake.includes(`Sec-WebSocket-Accept: ${expected}`)) {
            fail(new Error('websocket handshake rejected'));
            socket.destroy();
            return;
          }
          upgraded = true;
          settled = true;
          const tail = Buffer.from(handshake.slice(idx + 4), 'binary');
          handshake = '';
          if (tail.length) {
            reader(tail);
          }
          resolve({
            transport: {
              send: (event) => {
                socket.write(encodeClientTextFrame(JSON.stringify(event)));
              },
              onMessage: (h) => {
                handlers.add(h);
                return () => handlers.delete(h);
              },
            },
            close: () =>
              new Promise((r) => {
                socket.end(() => r());
              }),
          });
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
