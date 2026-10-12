/**
 * Serve `dist/pages` the way GitHub Pages does for this project site
 * (everything under `/meta-sovereign/`), for the issue #37 browser
 * checks. Run `node js/scripts/build-pages.mjs` first.
 */

import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const PAGES = path.join(ROOT, 'dist', 'pages');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
};

/** Resolves to `{ server, base }`; `base` ends with `/meta-sovereign/`. */
export const servePages = () =>
  new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://x');
      let rel = url.pathname.replace(/^\/meta-sovereign/, '');
      if (rel.endsWith('/')) {
        rel += 'index.html';
      }
      try {
        const body = await fs.readFile(path.join(PAGES, rel));
        res.writeHead(200, {
          'content-type': MIME[path.extname(rel)] ?? 'application/octet-stream',
        });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () =>
      resolve({
        server,
        base: `http://127.0.0.1:${server.address().port}/meta-sovereign/`,
      })
    );
  });
