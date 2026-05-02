import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';

const fetchJson = async (url, init) => {
  const r = await fetch(url, init);
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
};

// Send a literal HTTP request line over a raw TCP socket so URL
// normalisation in `fetch` (Bun, Deno, Node all collapse `..`) can't
// rewrite the path before it reaches the server.
const rawRequestStatus = (port, rawPath) =>
  new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: '127.0.0.1', port }, () => {
      sock.write(
        `GET ${rawPath} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`
      );
    });
    let buf = '';
    sock.setEncoding('utf8');
    sock.on('data', (chunk) => {
      buf += chunk;
    });
    sock.on('end', () => {
      const m = /^HTTP\/1\.\d (\d{3})/.exec(buf);
      resolve(m ? Number(m[1]) : 0);
    });
    sock.on('error', reject);
  });

describe('http server', () => {
  it('round-trips a link via HTTP', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-srv-'));
    const handle = await startServer({ port: 0, storeDir: dir });
    const base = `http://127.0.0.1:${handle.port}`;
    try {
      await fetchJson(`${base}/links`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'a', tokens: ['hi'] }),
      });
      const got = await fetchJson(`${base}/links/a`);
      expect(got.body.tokens[0]).toBe('hi');
      const list = await fetchJson(`${base}/links`);
      expect(list.body.length).toBe(1);
    } finally {
      await handle.close();
    }
  });
  it('exposes /sources', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-srv2-'));
    const handle = await startServer({ port: 0, storeDir: dir });
    try {
      const r = await fetchJson(`http://127.0.0.1:${handle.port}/sources`);
      expect(r.body.includes('telegram')).toBe(true);
    } finally {
      await handle.close();
    }
  });

  it('serves the SPA shell at /', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-srv3-'));
    const handle = await startServer({ port: 0, storeDir: dir });
    try {
      const r = await fetch(`http://127.0.0.1:${handle.port}/`);
      const text = await r.text();
      expect(r.status).toBe(200);
      expect(text.includes('meta-sovereign')).toBe(true);
      const js = await fetch(`http://127.0.0.1:${handle.port}/app.js`);
      expect(js.status).toBe(200);
      await js.text();
      const css = await fetch(`http://127.0.0.1:${handle.port}/app.css`);
      expect(css.status).toBe(200);
      await css.text();
    } finally {
      await handle.close();
    }
  });

  it('exposes derived API routes', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-srv4-'));
    const handle = await startServer({ port: 0, storeDir: dir });
    const base = `http://127.0.0.1:${handle.port}`;
    try {
      await fetchJson(`${base}/links`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'msg:telegram:1',
          tokens: ['message', 'telegram', '1'],
          sender: 'alice',
          chat: 'general',
          source: 'telegram',
          body: 'hi',
        }),
      });
      const contacts = await fetchJson(`${base}/api/contacts`);
      expect(contacts.body.length).toBe(1);
      expect(contacts.body[0].id).toBe('alice');

      const infer = await fetchJson(`${base}/api/patterns/infer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ examples: ['hi alice', 'hi bob'] }),
      });
      expect(typeof infer.body.regex).toBe('string');

      await fetchJson(`${base}/api/graphs`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'graph:greet',
          tokens: ['graph', 'greet'],
          nodes: [],
          edges: [],
        }),
      });
      const graphs = await fetchJson(`${base}/api/graphs`);
      expect(graphs.body.find((g) => g.id === 'graph:greet')).toBeTruthy();

      const status = await fetchJson(`${base}/api/status`);
      expect(typeof status.body.links).toBe('number');
      expect(status.body.messages).toBe(1);
      expect(status.body.graphs).toBe(1);
    } finally {
      await handle.close();
    }
  });

  it('mounts browser-safe sibling modules under /storage and /handlers', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-srv5-'));
    const handle = await startServer({ port: 0, storeDir: dir });
    const base = `http://127.0.0.1:${handle.port}`;
    try {
      const browserStore = await fetch(`${base}/storage/browser-store.js`);
      expect(browserStore.status).toBe(200);
      await browserStore.text();

      const handlers = await fetch(`${base}/handlers/index.js`);
      expect(handlers.status).toBe(200);
      await handlers.text();

      // Traversal stays inside the mount dir. We send a raw HTTP
      // request so the runtime's fetch URL-normaliser doesn't collapse
      // `/storage/../etc/passwd` to `/etc/passwd` before it leaves the
      // client (Bun, Deno, and Node all do this in `fetch`).
      const traversalStatus = await rawRequestStatus(
        handle.port,
        '/storage/../etc/passwd'
      );
      expect([403, 404]).toContain(traversalStatus);

      // Only `.js` files are served from a mount.
      const txt = await fetch(`${base}/storage/notes.txt`);
      expect(txt.status).toBe(404);
      await txt.text();

      // Subdirectories inside a mount are not exposed.
      const nested = await fetch(`${base}/storage/sub/inner.js`);
      expect(nested.status).toBe(404);
      await nested.text();
    } finally {
      await handle.close();
    }
  });
});

describe('http server observability', () => {
  it('exposes /metrics in Prometheus exposition format', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-mtr-'));
    const handle = await startServer({ port: 0, storeDir: dir });
    const base = `http://127.0.0.1:${handle.port}`;
    try {
      await fetch(`${base}/links`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'msg:m1', tokens: ['m'] }),
      }).then((r) => r.text());
      const r = await fetch(`${base}/metrics`);
      expect(r.status).toBe(200);
      const body = await r.text();
      expect(body).toContain('# HELP meta_sovereign_links_total');
      expect(body).toContain('# TYPE meta_sovereign_links_total gauge');
      expect(body).toMatch(/meta_sovereign_links_by_kind\{kind="message"\} 1/);
      expect(body).toMatch(/meta_sovereign_ws_peers \d+/);
    } finally {
      await handle.close();
    }
  });
  it('writes JSON access logs when log option is provided', async () => {
    const { jsonLog } = await import('../src/server/log.js');
    const lines = [];
    const log = jsonLog({ write: (line) => lines.push(line) });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-log-'));
    const handle = await startServer({ port: 0, storeDir: dir, log });
    const base = `http://127.0.0.1:${handle.port}`;
    try {
      await fetch(`${base}/sources`).then((r) => r.text());
      // wait for `finish` event to flush
      await new Promise((r) => setTimeout(r, 25));
      const httpLines = lines
        .map((l) => JSON.parse(l))
        .filter((e) => e.event === 'http');
      expect(httpLines.length).toBeGreaterThan(0);
      expect(httpLines.at(-1).path).toBe('/sources');
      expect(httpLines.at(-1).status).toBe(200);
      expect(typeof httpLines.at(-1).duration_ms).toBe('number');
    } finally {
      await handle.close();
    }
  });
  it('emits Content-Security-Policy + hardening headers on every response', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-csp-'));
    const handle = await startServer({ port: 0, storeDir: dir });
    const base = `http://127.0.0.1:${handle.port}`;
    try {
      const html = await fetch(`${base}/`);
      await html.text();
      expect(html.headers.get('content-security-policy')).toMatch(
        /default-src 'self'/
      );
      expect(html.headers.get('x-content-type-options')).toBe('nosniff');
      expect(html.headers.get('x-frame-options')).toBe('DENY');
      expect(html.headers.get('referrer-policy')).toBe('no-referrer');
      const api = await fetch(`${base}/sources`);
      await api.json();
      expect(api.headers.get('content-security-policy')).toMatch(
        /default-src 'self'/
      );
      const wasm = await fetch(`${base}/pattern-matcher.wasm`);
      await wasm.arrayBuffer();
      expect(wasm.status).toBe(200);
      expect(wasm.headers.get('content-type')).toBe('application/wasm');
    } finally {
      await handle.close();
    }
  });
});
