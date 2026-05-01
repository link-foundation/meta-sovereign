/**
 * Local web server (R-F4) + universal links HTTP surface (R-F8) + UI (R-F1).
 *
 * Endpoints:
 *   GET  /                       -> SPA shell (src/web/index.html)
 *   GET  /app.js, /app.css       -> SPA assets
 *   GET  /links                  -> list all links
 *   GET  /links/:id              -> read one
 *   PUT  /links                  -> upsert (body = link JSON)
 *   DEL  /links/:id              -> delete
 *   GET  /sources                -> list message-source adapters
 *   GET  /api/contacts           -> contacts derived from messages
 *   GET  /api/patterns           -> persisted patterns (id starts with `pattern:`)
 *   POST /api/patterns/infer     -> { examples } -> { regex }
 *   GET  /api/graphs             -> persisted automation graphs
 *   PUT  /api/graphs             -> upsert graph (body = graph JSON)
 *   GET  /api/status             -> store stats + verify diff count
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
import { inferRegex, simplifyRegex } from '../patterns/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..', 'web');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });

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

const aggregateContacts = (links) => {
  const messages = links.filter((l) => l.id?.startsWith('msg:'));
  const byContact = new Map();
  for (const m of messages) {
    if (!m.sender) {
      continue;
    }
    const entry = byContact.get(m.sender) ?? {
      id: m.sender,
      networks: new Set(),
      messageCount: 0,
    };
    entry.networks.add(m.source);
    entry.messageCount += 1;
    byContact.set(m.sender, entry);
  }
  return [...byContact.values()].map((c) => ({
    ...c,
    networks: [...c.networks],
  }));
};

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
  return false;
};

const handleLinks = async (store, req, res, p) => {
  if (p === '/links' && req.method === 'GET') {
    json(res, 200, await store.query());
    return true;
  }
  if (p === '/links' && req.method === 'PUT') {
    const link = await readBody(req);
    await store.put(link);
    json(res, 200, link);
    return true;
  }
  const m = p.match(/^\/links\/(.+)$/);
  if (m && req.method === 'GET') {
    const link = await store.get(decodeURIComponent(m[1]));
    link ? json(res, 200, link) : json(res, 404, { error: 'not found' });
    return true;
  }
  if (m && req.method === 'DELETE') {
    const ok = await store.delete(decodeURIComponent(m[1]));
    json(res, ok ? 200 : 404, { ok });
    return true;
  }
  return false;
};

const handlePatterns = async (store, req, res, p) => {
  if (p === '/api/patterns' && req.method === 'GET') {
    const all = await store.query();
    json(
      res,
      200,
      all.filter((l) => l.id?.startsWith('pattern:'))
    );
    return true;
  }
  if (p === '/api/patterns/infer' && req.method === 'POST') {
    const { examples } = await readBody(req);
    const regex = simplifyRegex(inferRegex(examples ?? []));
    json(res, 200, { regex: regex.source, flags: regex.flags });
    return true;
  }
  return false;
};

const handleGraphs = async (store, req, res, p) => {
  if (p === '/api/graphs' && req.method === 'GET') {
    const all = await store.query();
    json(
      res,
      200,
      all.filter((l) => l.id?.startsWith('graph:'))
    );
    return true;
  }
  if (p === '/api/graphs' && req.method === 'PUT') {
    const graph = await readBody(req);
    if (!graph.id?.startsWith('graph:')) {
      json(res, 400, { error: 'graph.id must start with "graph:"' });
      return true;
    }
    await store.put(graph);
    json(res, 200, graph);
    return true;
  }
  return false;
};

const handleStatus = async (store, res) => {
  const all = await store.query();
  const diffs = (await store.verify?.()) ?? [];
  json(res, 200, {
    links: all.length,
    messages: all.filter((l) => l.id?.startsWith('msg:')).length,
    patterns: all.filter((l) => l.id?.startsWith('pattern:')).length,
    graphs: all.filter((l) => l.id?.startsWith('graph:')).length,
    verifyDiffs: diffs.length,
  });
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
  if (await handleLinks(store, req, res, p)) {
    return;
  }
  if (p === '/api/contacts' && req.method === 'GET') {
    return json(res, 200, aggregateContacts(await store.query()));
  }
  if (await handlePatterns(store, req, res, p)) {
    return;
  }
  if (await handleGraphs(store, req, res, p)) {
    return;
  }
  if (p === '/api/status' && req.method === 'GET') {
    return handleStatus(store, res);
  }
  return json(res, 404, { error: 'unknown route' });
};

export const startServer = async ({
  port = 0,
  storeDir = '.meta-sovereign',
  store: providedStore,
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
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const actualPort = server.address().port;
  return {
    port: actualPort,
    store,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
};
