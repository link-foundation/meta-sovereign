import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/index.js';
import {
  createBackup,
  pruneBackups,
  restoreBackup,
  encryptBackup,
  decryptBackup,
} from '../src/storage/backup.js';

describe('backup', () => {
  it('writes a snapshot and restores it', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-bk-'));
    const s = createMemoryStore();
    await s.put({ id: 'a', tokens: ['x'] });
    const file = await createBackup(s, { archiveDir: dir });
    const s2 = createMemoryStore();
    const n = await restoreBackup(s2, file);
    expect(n).toBe(1);
    expect((await s2.get('a')).tokens[0]).toBe('x');
  });
  it('prunes to keep N', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-bk2-'));
    const s = createMemoryStore();
    for (let i = 0; i < 4; i += 1) {
      await createBackup(s, {
        archiveDir: dir,
        now: new Date(Date.now() + i * 1000),
      });
    }
    const removed = await pruneBackups({ archiveDir: dir, keep: 2 });
    expect(removed.length).toBe(2);
    const remaining = (await fs.readdir(dir)).filter((f) =>
      f.startsWith('meta-sovereign-')
    );
    expect(remaining.length).toBe(2);
  });
  it('round-trips an encrypted backup', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-bk3-'));
    const s = createMemoryStore();
    await s.put({ id: 'secret', tokens: ['top', 'secret'] });
    const file = await createBackup(s, {
      archiveDir: dir,
      passphrase: 'correct horse',
    });
    expect(file.endsWith('.json.enc')).toBe(true);
    const onDisk = await fs.readFile(file, 'utf8');
    expect(onDisk.includes('secret')).toBe(false);
    const s2 = createMemoryStore();
    const n = await restoreBackup(s2, file, { passphrase: 'correct horse' });
    expect(n).toBe(1);
    expect((await s2.get('secret')).tokens[1]).toBe('secret');
  });
  it('rejects the wrong passphrase', async () => {
    const env = encryptBackup('hello', 'right');
    let threw = false;
    try {
      decryptBackup(env, 'wrong');
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
