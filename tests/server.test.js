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
});
