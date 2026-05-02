/**
 * Local web server (R-F4) + universal links HTTP surface (R-F8) + UI (R-F1).
 *
 * Endpoints (full list lives in `routes-derived.js` and `routes-mutating.js`):
 *   GET  /                         -> SPA shell
 *   GET  /app.js, /app.css         -> SPA assets
 *   GET  /links, /links/:id        -> read links
 *   PUT  /links                    -> upsert
 *   DEL  /links/:id                -> delete
 *   GET  /sources                  -> list message-source adapters
 *   GET  /api/contacts             -> contacts derived from messages
 *   GET  /api/status               -> store stats + verify diff count
 *   GET  /api/autocomplete?q=&me=  -> outgoing-history-driven completions
 *   GET  /api/audience?q=          -> set-algebra over store filters
 *   GET  /api/facts                -> question-answer pairs per partner
 *   GET  /api/search?q=            -> dice-similarity search
 *   GET  /api/patterns             -> persisted patterns
 *   PUT  /api/patterns             -> upsert pattern link
 *   POST /api/patterns/infer       -> { examples, mode } -> { regex, flags }
 *   GET  /api/graphs               -> persisted automation graphs
 *   PUT  /api/graphs               -> upsert graph
 *   POST /api/graphs/run           -> { id, message, mode } -> plan
 *   GET  /api/replies              -> persisted reply variation groups
 *   PUT  /api/replies              -> upsert reply variation group
 *   GET  /api/profile              -> read profile (R-D5)
 *   PUT  /api/profile              -> upsert + plan cross-network sync
 *   GET  /api/resume               -> read resume (R-D6)
 *   PUT  /api/resume               -> upsert + plan cross-network sync
 *   POST /api/broadcast            -> queue post for outbound networks
 *
 * Implemented with Node's built-in `http` module to keep the dependency
 * footprint at zero. The Docker images in `docker/` simply run
 * `node bin/meta-sovereign serve`.
 */

import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createDualStore,
  createLinoTextStore,
  createDoubletsStore,
} from '../storage/index.js';
import { listSources } from '../sources/index.js';
import { json } from './util.js';
import { handleDerivedRoutes } from './routes-derived.js';
import { handleMutatingRoutes } from './routes-mutating.js';
import { createPeer, attachSyncWebSocket } from '../sync/index.js';
import { attachSignaling } from '../sync/webrtc-signaling.js';
import { registerDefaultHandlers } from './handlers-bootstrap.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..', 'web');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const serveStatic = async (res, filePath) => {
  try {
    const buf = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
    });
    res.end(buf);
    return true;
  } catch {
    return false;
  }
};

// Browser-safe modules outside src/web that the SPA imports directly.
// Each entry maps a URL prefix to the directory under src/ that holds
// the matching file. Only files whose name matches the allow-list
// regex are served, and the resolved path must stay under the mapped
// directory (no `..`).
const SRC_ROOT = path.resolve(here, '..');
const BROWSER_MOUNTS = [
  ['/storage/', path.join(SRC_ROOT, 'storage')],
  ['/handlers/', path.join(SRC_ROOT, 'handlers')],
  ['/sync/', path.join(SRC_ROOT, 'sync')],
];

const handleStatic = async (req, res, p) => {
  if (req.method !== 'GET') {
    return false;
  }
  if (p === '/' || p === '/index.html') {
    return serveStatic(res, path.join(webRoot, 'index.html'));
  }
  if (/^\/[a-zA-Z0-9._-]+\.(js|css|svg)$/.test(p)) {
    return serveStatic(res, path.join(webRoot, p.slice(1)));
  }
  for (const [prefix, dir] of BROWSER_MOUNTS) {
    if (!p.startsWith(prefix)) {
      continue;
    }
    const tail = p.slice(prefix.length);
    if (!/^[a-zA-Z0-9._-]+\.js$/.test(tail)) {
      continue;
    }
    const resolved = path.join(dir, tail);
    if (!resolved.startsWith(dir + path.sep) && resolved !== dir) {
      continue;
    }
    return serveStatic(res, resolved);
  }
  return false;
};

const route = async (store, req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  if (await handleStatic(req, res, p)) {
    return;
  }
  if (p === '/sources' && req.method === 'GET') {
    return json(res, 200, listSources());
  }
  if (await handleMutatingRoutes(store, req, res, p)) {
    return;
  }
  if (await handleDerivedRoutes(store, req, res, p, url)) {
    return;
  }
  return json(res, 404, { error: 'unknown route' });
};

export const startServer = async ({
  port = 0,
  storeDir = '.meta-sovereign',
  store: providedStore,
  enableHandlers = true,
  enableSync = true,
  node = 'server',
} = {}) => {
  let store = providedStore;
  if (!store) {
    await fs.mkdir(storeDir, { recursive: true });
    const text = await createLinoTextStore(path.join(storeDir, 'data.lino'));
    const binary = await createDoubletsStore(path.join(storeDir, 'data.bin'));
    store = createDualStore({ binary, text });
  }
  const server = http.createServer((req, res) => {
    route(store, req, res).catch((err) =>
      json(res, 500, { error: err.message })
    );
  });
  let bus = null;
  if (enableHandlers) {
    bus = registerDefaultHandlers(store);
  }
  let wsHandle = null;
  let signaling = null;
  if (enableSync) {
    wsHandle = attachSyncWebSocket(server, { path: '/ws' });
    const peer = createPeer(store, { node });
    peer.connect(wsHandle.transport);
    signaling = attachSignaling(server, { path: '/rtc' });
  }
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    store,
    bus,
    sync: wsHandle,
    signaling,
    close: () =>
      new Promise((resolve) => {
        bus?.close();
        wsHandle?.close();
        signaling?.close();
        server.close(() => resolve());
      }),
  };
};
