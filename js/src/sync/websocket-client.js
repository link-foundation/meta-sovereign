import { syncWire } from './wire.js';

/** The browser/Bun/Deno WebSocket implementation, with no JSON fallback. */
export const connectNativeWebSocket = ({
  url,
  WebSocketImpl = globalThis.WebSocket,
  ...options
}) => {
  const wire = syncWire(options);
  return new Promise((resolve, reject) => {
    const handlers = new Set();
    const socket = new WebSocketImpl(url, wire.protocol);
    socket.binaryType = 'arraybuffer';
    let settled = false;
    const fail = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    socket.addEventListener('open', () => {
      if (socket.protocol !== wire.protocol) {
        fail(new Error('websocket sync protocol was not negotiated'));
        socket.close();
        return;
      }
      settled = true;
      resolve({
        transport: {
          send: (event) => {
            if (socket.readyState !== WebSocketImpl.OPEN) {
              throw new Error('websocket is closed');
            }
            socket.send(wire.encode(event));
          },
          onMessage: (handler) => {
            handlers.add(handler);
            return () => handlers.delete(handler);
          },
        },
        close: () =>
          new Promise((done) => {
            handlers.clear();
            if (socket.readyState === WebSocketImpl.CLOSED) {
              done();
              return;
            }
            socket.addEventListener('close', done, { once: true });
            socket.close();
          }),
      });
    });
    socket.addEventListener('message', (event) => {
      let decoded;
      try {
        decoded = wire.decode(event.data);
      } catch {
        socket.close(1003, 'invalid sync message');
        return;
      }
      for (const handler of handlers) {
        handler(decoded);
      }
    });
    socket.addEventListener('error', () =>
      fail(new Error('websocket handshake rejected'))
    );
    socket.addEventListener('close', () =>
      fail(new Error('websocket closed before handshake'))
    );
  });
};
