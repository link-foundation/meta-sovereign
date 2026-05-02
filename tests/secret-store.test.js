import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { wrapSecretStore } from '../src/storage/secret-store.js';
import { createPeer, loopback } from '../src/sync/index.js';
import { startServer } from '../src/server/index.js';

describe('secret store encryption', () => {
  it('encrypts secret:* payload at rest and decrypts on read', async () => {
    const inner = createMemoryStore();
    const wrapped = wrapSecretStore({ inner, passphrase: 'hunter2' });

    await wrapped.put({
      id: 'secret:telegram:bot-token',
      tokens: ['secret', 'telegram', 'bot-token'],
      value: 'super-sensitive-token-12345',
      created: '2026-05-02',
    });

    // Inner store sees only ciphertext.
    const raw = await inner.get('secret:telegram:bot-token');
    expect(raw.id).toBe('secret:telegram:bot-token');
    expect(typeof raw.enc).toBe('string');
    expect(raw.value).toBeUndefined();
    expect(raw.created).toBeUndefined();
    // Tokens are derived from the id only — no plaintext leaks.
    expect(raw.tokens).toEqual(['secret', 'telegram', 'bot-token']);
    expect(raw.enc.includes('super-sensitive')).toBe(false);

    // Wrapped reads come back transparent.
    const got = await wrapped.get('secret:telegram:bot-token');
    expect(got.value).toBe('super-sensitive-token-12345');
    expect(got.created).toBe('2026-05-02');

    // Query also decrypts.
    const list = await wrapped.query();
    expect(list[0].value).toBe('super-sensitive-token-12345');
  });

  it('passes non-secret links through untouched', async () => {
    const inner = createMemoryStore();
    const wrapped = wrapSecretStore({ inner, passphrase: 'pass' });

    await wrapped.put({
      id: 'msg:telegram:1',
      tokens: ['hi'],
      sender: 'alice',
    });
    const raw = await inner.get('msg:telegram:1');
    expect(raw.tokens[0]).toBe('hi');
    expect(raw.sender).toBe('alice');
    expect(raw.enc).toBeUndefined();
  });

  it('returns inner store unchanged when no passphrase', () => {
    const inner = createMemoryStore();
    const wrapped = wrapSecretStore({ inner, passphrase: null });
    expect(wrapped).toBe(inner);
  });

  it('rejects reads with the wrong passphrase', async () => {
    const inner = createMemoryStore();
    const writer = wrapSecretStore({ inner, passphrase: 'good' });
    await writer.put({ id: 'secret:x', tokens: ['secret', 'x'], value: 'v' });

    const reader = wrapSecretStore({ inner, passphrase: 'bad' });
    let threw = false;
    try {
      await reader.get('secret:x');
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe('secret store + sync', () => {
  it('does not broadcast secret:* events to peers', async () => {
    const a = createMemoryStore();
    const b = createMemoryStore();
    const peerA = createPeer(a, { node: 'A' });
    const peerB = createPeer(b, { node: 'B' });
    const lb = loopback();
    peerA.connect(lb.a);
    peerB.connect(lb.b);

    await a.put({
      id: 'secret:telegram:bot-token',
      tokens: ['secret', 'telegram', 'bot-token'],
      value: 'do-not-leak',
    });
    await a.put({ id: 'msg:1', tokens: ['hi'] });
    await lb.settle();

    // The plain message must propagate.
    expect((await b.get('msg:1'))?.tokens?.[0]).toBe('hi');
    // The secret must NOT propagate.
    expect(await b.get('secret:telegram:bot-token')).toBeNull();
  });

  it('drops inbound secret:* events from a hostile peer', async () => {
    const a = createMemoryStore();
    const b = createMemoryStore();
    const peerB = createPeer(b, { node: 'B' });
    const lb = loopback();
    peerB.connect(lb.b);

    // A "hostile" peer A bypasses createPeer's outbound filter and
    // injects a secret event directly on the wire. Peer B must drop it.
    lb.a.send({
      type: 'put',
      link: {
        id: 'secret:injected',
        tokens: ['secret', 'injected'],
        value: 'x',
      },
    });
    await lb.settle();

    expect(await b.get('secret:injected')).toBeNull();
    void a;
  });
});

describe('http server with secret passphrase', () => {
  it('round-trips a secret link via HTTP', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-secret-'));
    const handle = await startServer({
      port: 0,
      storeDir: dir,
      secretPassphrase: 'top-secret',
    });
    const base = `http://127.0.0.1:${handle.port}`;
    try {
      const put = await fetch(`${base}/links`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'secret:telegram:bot-token',
          tokens: ['secret', 'telegram', 'bot-token'],
          value: 'plaintext-only-on-the-wire',
        }),
      });
      await put.text();

      const got = await fetch(`${base}/links/secret:telegram:bot-token`).then(
        (r) => r.json()
      );
      expect(got.value).toBe('plaintext-only-on-the-wire');

      // Verify the on-disk text store contains ciphertext, not plaintext.
      const linoText = await fs.readFile(path.join(dir, 'data.lino'), 'utf8');
      expect(linoText.includes('plaintext-only-on-the-wire')).toBe(false);
      expect(linoText.includes('secret:telegram:bot-token')).toBe(true);
    } finally {
      await handle.close();
    }
  });
});
