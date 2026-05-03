import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createVault,
  encryptWithKey,
  decryptWithKey,
} from '../src/storage/vault.js';

const tmp = (slug) => fs.mkdtemp(path.join(os.tmpdir(), `ms-vault-${slug}-`));

describe('master-key vault (R-K7..R-K12)', () => {
  it('initialize → encrypt → lock → unlock → decrypt round-trips', async () => {
    const dir = await tmp('init');
    const file = path.join(dir, 'vault.json');
    const v = createVault({ file });
    await v.initialize({ kind: 'passphrase', secret: 'correct horse' });
    const env = v.encrypt('payload');
    expect(JSON.parse(env).cipher).toBe('aes-256-gcm');
    expect(v.decrypt(env)).toBe('payload');
    v.lock();
    expect(v.isUnlocked()).toBe(false);
    expect(() => v.encrypt('x')).toThrow();
    await v.unlock({ secret: 'correct horse' });
    expect(v.isUnlocked()).toBe(true);
    expect(v.decrypt(env)).toBe('payload');
  });

  it('rejects unlock with the wrong secret', async () => {
    const dir = await tmp('wrong');
    const v = createVault({ file: path.join(dir, 'vault.json') });
    await v.initialize({ kind: 'passphrase', secret: 'right' });
    v.lock();
    let threw = false;
    try {
      await v.unlock({ secret: 'wrong' });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(v.isUnlocked()).toBe(false);
  });

  it('addUnlock lets a second method open the same master key (R-K8)', async () => {
    const dir = await tmp('multi');
    const file = path.join(dir, 'vault.json');
    const v = createVault({ file });
    await v.initialize({ kind: 'passphrase', secret: 'pass' });
    const env = v.encrypt('hello');
    await v.addUnlock({
      kind: 'pin',
      secret: '0429',
      label: 'mobile-pin',
    });
    v.lock();

    // PIN unlocks too.
    const v2 = createVault({ file });
    await v2.unlock({ secret: '0429' });
    expect(v2.decrypt(env)).toBe('hello');

    // Both unlock methods are listed.
    const list = await v2.listUnlocks();
    expect(list.map((u) => u.kind).sort()).toEqual(['passphrase', 'pin']);
  });

  it('removeUnlock cannot orphan the vault (R-K12)', async () => {
    const dir = await tmp('rm');
    const file = path.join(dir, 'vault.json');
    const v = createVault({ file });
    await v.initialize({ kind: 'passphrase', secret: 'pass' });
    const [{ id }] = await v.listUnlocks();
    let threw = false;
    try {
      await v.removeUnlock({ id });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    // Adding a second method makes removal allowed.
    await v.addUnlock({ kind: 'pin', secret: '0000' });
    const ok = await v.removeUnlock({ id });
    expect(ok).toBe(true);
    const remaining = await v.listUnlocks();
    expect(remaining.length).toBe(1);
    expect(remaining[0].kind).toBe('pin');
  });

  it('addUnlock requires the vault to be unlocked', async () => {
    const dir = await tmp('locked');
    const file = path.join(dir, 'vault.json');
    const v = createVault({ file });
    await v.initialize({ kind: 'passphrase', secret: 'pass' });
    v.lock();
    let threw = false;
    try {
      await v.addUnlock({ kind: 'pin', secret: '0000' });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('encryptWithKey + decryptWithKey are deterministic round-trips', () => {
    const key = Buffer.alloc(32, 7);
    const env = encryptWithKey('plaintext', key);
    expect(decryptWithKey(env, key)).toBe('plaintext');
  });

  it('initialize refuses to clobber an existing vault', async () => {
    const dir = await tmp('clobber');
    const file = path.join(dir, 'vault.json');
    const v = createVault({ file });
    await v.initialize({ kind: 'passphrase', secret: 'pass' });
    let threw = false;
    try {
      await v.initialize({ kind: 'passphrase', secret: 'other' });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
