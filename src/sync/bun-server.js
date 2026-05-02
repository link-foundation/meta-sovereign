/**
 * Bun runtime adapter for the WebSocket sync transport and the
 * WebRTC signaling broker.
 *
 * Bun's `node:http` upgrade socket (and `node:net.createConnection`)
 * do not deliver bytes back and forth in the way the hand-rolled
 * RFC 6455 server in `ws-transport.js` and `webrtc-signaling.js`
 * expect — `socket.write(...)` reports `true` but the bytes are
 * silently dropped. Bun's first-class story for WebSockets is
 * `Bun.serve({ websocket })` and the global `WebSocket` constructor,
 * both of which work correctly. This module rebuilds the same public
 * shapes on top of those primitives so the rest of the codebase does
 * not need to know which runtime it is on.
 *
 * Contract:
 *
 *   prepareBunHttp(httpServer) → registry
 *     Hijacks `httpServer.listen` so that calling `.listen(port, host,
 *     cb)` actually starts a `Bun.serve` instance on that port. Until
 *     `.listen` is called, attach functions can register WS paths +
 *     handlers via `registry.registerWs(path, handlers)` and the
 *     fallback HTTP request listener is taken from the original
 *     `httpServer`'s `request` listeners.
 *
 *   bunAttachWs(httpServer, { path, handlers }) → handle
 *     Registers a WS path on the (lazy) Bun server; returns the same
 *     `{ transport, close, socketCount }` shape as the Node version.
 *
 *   bunStartSyncWebSocketListener({ port, path }) → handle
 *     Starts a stand-alone Bun WS server with one /ws path. Returns
 *     the same `{ port, transport, path, close }` shape as the Node
 *     version.
 *
 *   bunConnectSyncWebSocket({ port, host, path }) → { transport, close }
 *     Wraps the global WebSocket so messages flow as JSON.
 *
 *   bunAttachSignaling(httpServer, { path }) → handle
 *     Same shape as `attachSignaling` but uses Bun.serve underneath.
 */

const REGISTRY = Symbol.for('meta-sovereign.bun-http-registry');

const startBunServer = (httpServer, registry, host, port) => {
  const requestListeners = httpServer.listeners('request');
  const bun = Bun.serve({
    port,
    hostname: host,
    fetch(req, srv) {
      const url = new URL(req.url);
      const pathname = url.pathname;
      if (registry.wsByPath.has(pathname)) {
        const ok = srv.upgrade(req, {
          data: { path: pathname, query: url.search },
        });
        if (ok) {
          return;
        }
      }
      return runRequestListeners(requestListeners, req);
    },
    websocket: {
      open(ws) {
        const handlers = registry.wsByPath.get(ws.data?.path);
        handlers?.onOpen?.(ws);
      },
      message(ws, msg) {
        const handlers = registry.wsByPath.get(ws.data?.path);
        handlers?.onMessage?.(ws, msg);
      },
      close(ws, code, reason) {
        const handlers = registry.wsByPath.get(ws.data?.path);
        handlers?.onClose?.(ws, code, reason);
      },
    },
  });
  registry.server = bun;
  httpServer.address = () => ({
    port: bun.port,
    address: host,
    family: 'IPv4',
  });
  const originalClose = httpServer.close.bind(httpServer);
  httpServer.close = (closeCb) => {
    try {
      bun.stop(true);
    } catch {
      // already stopped
    }
    registry.server = null;
    try {
      originalClose(() => closeCb?.());
    } catch {
      closeCb?.();
    }
    return httpServer;
  };
};

const installRegistry = (httpServer) => {
  if (httpServer[REGISTRY]) {
    return httpServer[REGISTRY];
  }
  const wsByPath = new Map();
  const registry = {
    wsByPath,
    server: null,
    httpServer,
    host: '127.0.0.1',
    registerWs(path, handlers) {
      wsByPath.set(path, handlers);
    },
    unregisterWs(path) {
      wsByPath.delete(path);
    },
  };
  httpServer[REGISTRY] = registry;

  // Case A: server is already listening when the first attach* fires.
  // We need to take over the port immediately.
  if (httpServer.listening) {
    const addr = httpServer.address();
    const port = addr?.port ?? 0;
    const host = addr?.address ?? '127.0.0.1';
    // Stop the http server so Bun.serve can claim the port.
    httpServer.close();
    startBunServer(httpServer, registry, host, port);
    return registry;
  }

  // Case B: attach* runs before listen — hijack listen so the Bun
  // server is what actually binds the port.
  const originalListen = httpServer.listen.bind(httpServer);
  httpServer.listen = (...args) => {
    const port = typeof args[0] === 'number' ? args[0] : 0;
    let host = '127.0.0.1';
    let cb;
    for (const arg of args.slice(1)) {
      if (typeof arg === 'string') {
        host = arg;
      } else if (typeof arg === 'function') {
        cb = arg;
      }
    }
    startBunServer(httpServer, registry, host, port);
    if (cb) {
      cb();
    }
    return httpServer;
  };
  // Reference originalListen to keep its potential future use simple.
  registry.originalListen = originalListen;

  return registry;
};

const runRequestListeners = async (listeners, req) => {
  if (!listeners.length) {
    return new Response('not found', { status: 404 });
  }
  // Bridge a Bun Request → a tiny node-style {req, res} pair so the
  // existing route(...) handler can fill in the response.
  const chunks = [];
  let status = 200;
  const headers = {};
  let resolved;
  const done = new Promise((r) => {
    resolved = r;
  });
  const nodeReq = bunRequestToNode(req);
  const finishHandlers = [];
  const nodeRes = {
    statusCode: 200,
    setHeader(k, v) {
      headers[k.toLowerCase()] = v;
    },
    getHeader(k) {
      return headers[k.toLowerCase()];
    },
    hasHeader(k) {
      return Object.prototype.hasOwnProperty.call(headers, k.toLowerCase());
    },
    writeHead(s, hOrReason, maybeHeaders) {
      status = s;
      // Mirror Node's behaviour where writeHead also updates statusCode
      // so subsequent reads of `res.statusCode` (and our `end()` below)
      // see the value the route actually set.
      nodeRes.statusCode = s;
      const h =
        maybeHeaders ??
        (hOrReason && typeof hOrReason === 'object' ? hOrReason : null);
      if (h) {
        for (const [k, v] of Object.entries(h)) {
          headers[k.toLowerCase()] = v;
        }
      }
    },
    write(chunk) {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
    },
    end(chunk) {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      // Honour either explicit `res.statusCode = N` or `writeHead(N)`.
      status = nodeRes.statusCode || status;
      // Node's http.ServerResponse fires a 'finish' event once the
      // response body is fully flushed; the JSON access logger in
      // src/server/index.js subscribes to it. Fire it here so the
      // logger works under Bun and Deno's compat shims too.
      for (const cb of finishHandlers) {
        try {
          cb();
        } catch {
          // logger errors must not break the response
        }
      }
      resolved();
    },
    on(event, cb) {
      if (event === 'finish') {
        finishHandlers.push(cb);
      }
    },
  };
  for (const l of listeners) {
    l(nodeReq, nodeRes);
  }
  await done;
  const body = Buffer.concat(chunks);
  return new Response(body, { status, headers });
};

const bunRequestToNode = (req) => {
  const url = new URL(req.url);
  const headers = Object.fromEntries(req.headers);
  // Bun's Request body is single-use, so buffer it once up front.
  let bodyPromise;
  const body = () => {
    if (!bodyPromise) {
      bodyPromise = req.arrayBuffer().catch(() => new ArrayBuffer(0));
    }
    return bodyPromise;
  };
  return {
    method: req.method,
    url: url.pathname + url.search,
    headers,
    on(event, cb) {
      if (event === 'data') {
        body().then((b) => {
          if (b.byteLength) {
            cb(Buffer.from(b));
          }
        });
      } else if (event === 'end') {
        body().then(() => cb());
      }
    },
  };
};

export const prepareBunHttp = (httpServer) => installRegistry(httpServer);

export const bunAttachWs = (httpServer, { path = '/ws', handlers }) => {
  const registry = installRegistry(httpServer);
  registry.registerWs(path, handlers);
  return {
    unregister: () => registry.unregisterWs(path),
  };
};

const wireSyncWsHandlers = () => {
  const sockets = new Set();
  const messageHandlers = new Set();
  const pending = [];
  const handlers = {
    onOpen(ws) {
      sockets.add(ws);
      while (pending.length) {
        ws.send(pending.shift());
      }
    },
    onMessage(ws, msg) {
      const text = typeof msg === 'string' ? msg : msg.toString('utf8');
      try {
        const event = JSON.parse(text);
        for (const h of messageHandlers) {
          h(event);
        }
      } catch {
        // ignore malformed
      }
    },
    onClose(ws) {
      sockets.delete(ws);
    },
  };
  const transport = {
    send(event) {
      const text = JSON.stringify(event);
      if (sockets.size === 0) {
        pending.push(text);
        return;
      }
      for (const s of sockets) {
        s.send(text);
      }
    },
    onMessage(h) {
      messageHandlers.add(h);
      return () => messageHandlers.delete(h);
    },
  };
  return {
    handlers,
    transport,
    closeAll() {
      for (const s of sockets) {
        try {
          s.close();
        } catch {
          // ignore
        }
      }
      sockets.clear();
      messageHandlers.clear();
    },
    socketCount: () => sockets.size,
  };
};

export const bunAttachSyncWebSocket = (httpServer, { path = '/ws' } = {}) => {
  const wired = wireSyncWsHandlers();
  const registry = installRegistry(httpServer);
  registry.registerWs(path, wired.handlers);
  return {
    transport: wired.transport,
    close: () => {
      registry.unregisterWs(path);
      wired.closeAll();
    },
    socketCount: wired.socketCount,
  };
};

export const bunStartSyncWebSocketListener = ({
  port = 0,
  path = '/ws',
} = {}) =>
  new Promise((resolve) => {
    const wired = wireSyncWsHandlers();
    const server = Bun.serve({
      port,
      hostname: '127.0.0.1',
      fetch(req, srv) {
        const url = new URL(req.url);
        if (url.pathname === path) {
          if (srv.upgrade(req)) {
            return;
          }
        }
        return new Response('meta-sovereign sync ws', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      },
      websocket: {
        open: (ws) => wired.handlers.onOpen(ws),
        message: (ws, msg) => wired.handlers.onMessage(ws, msg),
        close: (ws) => wired.handlers.onClose(ws),
      },
    });
    resolve({
      port: server.port,
      transport: wired.transport,
      path,
      close: () =>
        new Promise((r) => {
          wired.closeAll();
          try {
            server.stop(true);
          } catch {
            // already stopped
          }
          r();
        }),
    });
  });

export const bunConnectSyncWebSocket = ({
  port,
  host = '127.0.0.1',
  path = '/ws',
}) =>
  new Promise((resolve, reject) => {
    const handlers = new Set();
    const ws = new WebSocket(`ws://${host}:${port}${path}`);
    let settled = false;
    ws.addEventListener('open', () => {
      settled = true;
      resolve({
        transport: {
          send(event) {
            ws.send(JSON.stringify(event));
          },
          onMessage(h) {
            handlers.add(h);
            return () => handlers.delete(h);
          },
        },
        close: () =>
          new Promise((r) => {
            ws.addEventListener('close', () => r(), { once: true });
            ws.close();
          }),
      });
    });
    ws.addEventListener('message', (e) => {
      const text =
        typeof e.data === 'string'
          ? e.data
          : Buffer.from(e.data).toString('utf8');
      try {
        const event = JSON.parse(text);
        for (const h of handlers) {
          h(event);
        }
      } catch {
        // ignore malformed
      }
    });
    ws.addEventListener('error', () => {
      if (!settled) {
        settled = true;
        reject(new Error('websocket connection failed'));
      }
    });
    ws.addEventListener('close', () => {
      if (!settled) {
        settled = true;
        reject(new Error('websocket closed before open'));
      }
    });
  });

const wireSignalingHandlers = () => {
  const rooms = new Map();
  const join = (room, ws) => {
    if (!rooms.has(room)) {
      rooms.set(room, new Set());
    }
    rooms.get(room).add(ws);
  };
  const leave = (room, ws) => {
    rooms.get(room)?.delete(ws);
    if (rooms.get(room)?.size === 0) {
      rooms.delete(room);
    }
  };
  const handlers = {
    onOpen(ws) {
      const params = new URLSearchParams(ws.data?.query ?? '');
      const room = params.get('room') ?? 'default';
      ws.data.room = room;
      join(room, ws);
      const peerId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const announce = JSON.stringify({ type: 'peer-joined', peerId });
      for (const other of rooms.get(room)) {
        if (other !== ws) {
          other.send(announce);
        }
      }
    },
    onMessage(ws, msg) {
      const text = typeof msg === 'string' ? msg : msg.toString('utf8');
      const room = ws.data?.room;
      for (const other of rooms.get(room) ?? []) {
        if (other !== ws) {
          other.send(text);
        }
      }
    },
    onClose(ws) {
      const room = ws.data?.room;
      if (room) {
        leave(room, ws);
      }
    },
  };
  return {
    handlers,
    rooms,
    closeAll() {
      for (const peers of rooms.values()) {
        for (const ws of peers) {
          try {
            ws.close();
          } catch {
            // ignore
          }
        }
      }
      rooms.clear();
    },
  };
};

export const bunAttachSignaling = (httpServer, { path = '/rtc' } = {}) => {
  const wired = wireSignalingHandlers();
  const registry = installRegistry(httpServer);
  registry.registerWs(path, wired.handlers);
  return {
    close: () => {
      registry.unregisterWs(path);
      wired.closeAll();
    },
    rooms: () => [...wired.rooms.keys()],
    peers: (room) => wired.rooms.get(room)?.size ?? 0,
  };
};
