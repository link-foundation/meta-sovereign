import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';

const fetchJson = async (url, init) => {
  const r = await fetch(url, init);
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
};

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
      const css = await fetch(`http://127.0.0.1:${handle.port}/app.css`);
      expect(css.status).toBe(200);
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
});
