/**
 * TCP transport for the peer abstraction (R-F5 stand-in).
 *
 * The full WebRTC stack needs an STUN/TURN signalling layer plus
 * `RTCDataChannel`. Until that lands, this adapter speaks newline-
 * delimited JSON over a plain TCP socket — same contract the
 * `loopback` transport uses, but real cross-process. The peer code in
 * `createPeer` does not change; once the WebRTC adapter is ready it
 * plugs in via the same `{ send, onMessage }` interface.
 */

import net from 'node:net';

const wireSend = (socket, event) => {
  socket.write(`${JSON.stringify(event)}\n`);
};

const wireRead = (socket, handlers) => {
  let buf = '';
  socket.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line) {
        continue;
      }
      try {
        const event = JSON.parse(line);
        for (const h of handlers) {
          h(event);
        }
      } catch {
        // ignore malformed frames; the peer protocol is fault-tolerant.
      }
    }
  });
};

export const startSyncListener = ({ port = 0 } = {}) =>
  new Promise((resolve) => {
    const handlers = new Set();
    const sockets = new Set();
    // Buffer events emitted before any peer is connected so we don't
    // silently drop the very first put. On bun/macOS the server's
    // `connection` event can fire after the client's `connect` callback,
    // which would otherwise lose the first message.
    const pending = [];
    const server = net.createServer((socket) => {
      sockets.add(socket);
      wireRead(socket, handlers);
      while (pending.length) {
        wireSend(socket, pending.shift());
      }
      socket.on('close', () => sockets.delete(socket));
    });
    server.listen(port, '127.0.0.1', () => {
      const transport = {
        send: (event) => {
          if (sockets.size === 0) {
            pending.push(event);
            return;
          }
          for (const s of sockets) {
            wireSend(s, event);
          }
        },
        onMessage: (h) => {
          handlers.add(h);
          return () => handlers.delete(h);
        },
      };
      resolve({
        port: server.address().port,
        transport,
        close: () =>
          new Promise((r) => {
            for (const s of sockets) {
              s.destroy();
            }
            server.close(() => r());
          }),
      });
    });
  });

export const connectSyncPeer = ({ port, host = '127.0.0.1' } = {}) =>
  new Promise((resolve, reject) => {
    const handlers = new Set();
    const socket = net.createConnection({ port, host }, () => {
      wireRead(socket, handlers);
      resolve({
        transport: {
          send: (event) => wireSend(socket, event),
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
    });
    socket.on('error', reject);
  });
