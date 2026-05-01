/**
 * Local web server (R-F4) + universal links HTTP surface (R-F8).
 *
 * Implemented with Node's built-in `http` module to keep the
 * dependency footprint at zero. Endpoints:
 *   GET  /links              -> list all
 *   GET  /links/:id          -> read one
 *   PUT  /links              -> write one (body = link JSON)
 *   DEL  /links/:id          -> delete
 *   GET  /sources            -> list adapters
 *
 * The Docker images in `docker/` simply run `node bin/meta-sovereign serve`.
 */

import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  createDualStore,
  createLinoTextStore,
  createDoubletsStore,
} from '../storage/index.js';
import { listSources } from '../sources/index.js';

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

const route = async (store, req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/sources' && req.method === 'GET') {
    return json(res, 200, listSources());
  }
  if (url.pathname === '/links' && req.method === 'GET') {
    return json(res, 200, await store.query());
  }
  if (url.pathname === '/links' && req.method === 'PUT') {
    const link = await readBody(req);
    await store.put(link);
    return json(res, 200, link);
  }
  const m = url.pathname.match(/^\/links\/(.+)$/);
  if (m && req.method === 'GET') {
    const link = await store.get(decodeURIComponent(m[1]));
    return link ? json(res, 200, link) : json(res, 404, { error: 'not found' });
  }
  if (m && req.method === 'DELETE') {
    const ok = await store.delete(decodeURIComponent(m[1]));
    return json(res, ok ? 200 : 404, { ok });
  }
  return json(res, 404, { error: 'unknown route' });
};

export const startServer = async ({
  port = 0,
  storeDir = '.meta-sovereign',
} = {}) => {
  await fs.mkdir(storeDir, { recursive: true });
  const text = await createLinoTextStore(path.join(storeDir, 'data.lino'));
  const binary = await createDoubletsStore(path.join(storeDir, 'data.bin'));
  const store = createDualStore({ binary, text });

  const server = http.createServer((req, res) => {
    route(store, req, res).catch((err) =>
      json(res, 500, { error: err.message })
    );
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const actualPort = server.address().port;
  return {
    port: actualPort,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
};
