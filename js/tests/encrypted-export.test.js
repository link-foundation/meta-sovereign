import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  exportEncrypted,
  decryptExport,
  writeEncryptedExport,
  DEFAULT_WARNING,
} from '../src/storage/export-encrypted.js';
import { startServer } from '../src/server/index.js';

const fetchJson = async (url, init) => {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
};

describe('encrypted export (R-K13..R-K17)', () => {
  it('refuses to export without a passphrase (R-K13)', async () => {
    const store = createMemoryStore();
    let threw = false;
    try {
      await exportEncrypted(store, { passphrase: '' });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('round-trips an envelope through decryptExport (R-K14)', async () => {
    const store = createMemoryStore();
    await store.put({ id: 'msg:1', tokens: ['m'], body: 'hello' });
    const env = await exportEncrypted(store, { passphrase: 'hunter2' });
    const parsed = JSON.parse(env);
    expect(parsed.kind).toBe('meta-sovereign-export');
    // Plaintext is not in the envelope (R-K15).
    expect(env.includes('hello')).toBe(false);
    // Default warning is emitted (R-K16).
    expect(parsed.warning).toBe(DEFAULT_WARNING);

    const opened = decryptExport(env, 'hunter2');
    expect(opened.links[0].body).toBe('hello');
  });

  it('writeEncryptedExport produces a file usable by decryptExport', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-exp-'));
    const file = path.join(dir, 'export.json');
    const store = createMemoryStore();
    await store.put({ id: 'a', tokens: ['a'], body: 'top-secret' });
    await writeEncryptedExport(store, file, { passphrase: 'pp' });
    const raw = await fs.readFile(file, 'utf8');
    expect(raw.includes('top-secret')).toBe(false);
    const opened = decryptExport(raw, 'pp');
    expect(opened.links[0].body).toBe('top-secret');
  });

  it('POST /api/export-encrypted refuses without a passphrase', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-exp-srv-'));
    const handle = await startServer({ port: 0, storeDir: dir });
    const base = `http://127.0.0.1:${handle.port}`;
    try {
      const fail = await fetchJson(`${base}/api/export-encrypted`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(fail.status).toBe(400);

      const ok = await fetchJson(`${base}/api/export-encrypted`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passphrase: 'pp' }),
      });
      expect(ok.status).toBe(200);
      expect(ok.body.kind).toBe('meta-sovereign-export');
      expect(typeof ok.body.warning).toBe('string');
    } finally {
      await handle.close();
    }
  });
});
