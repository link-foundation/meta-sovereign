import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/index.js';
import { createBackupScheduler } from '../src/storage/backup.js';

describe('createBackupScheduler', () => {
  it('runs immediately via runNow and produces a snapshot', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-sched-'));
    const store = createMemoryStore();
    await store.put({ id: 'a', tokens: ['x'] });
    let written = null;
    const sched = createBackupScheduler({
      store,
      archiveDir: dir,
      intervalMs: 60_000,
      onBackup: (f) => {
        written = f;
      },
    });
    await sched.runNow();
    sched.stop();
    expect(written).not.toBe(null);
    const files = (await fs.readdir(dir)).filter((f) =>
      f.startsWith('meta-sovereign-')
    );
    expect(files.length).toBe(1);
  });
  it('prunes to keep N when keep > 0', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-sched2-'));
    const store = createMemoryStore();
    await store.put({ id: 'a', tokens: ['x'] });
    const sched = createBackupScheduler({
      store,
      archiveDir: dir,
      intervalMs: 60_000,
      keep: 1,
    });
    await sched.runNow();
    await new Promise((r) => setTimeout(r, 5));
    await sched.runNow();
    sched.stop();
    const files = (await fs.readdir(dir)).filter((f) =>
      f.startsWith('meta-sovereign-')
    );
    expect(files.length).toBe(1);
  });
  it('reports errors via onError and continues running', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-sched3-'));
    const failingStore = {
      query: async () => {
        throw new Error('boom');
      },
    };
    let captured = null;
    const sched = createBackupScheduler({
      store: failingStore,
      archiveDir: dir,
      intervalMs: 60_000,
      onError: (e) => {
        captured = e;
      },
    });
    await sched.runNow();
    sched.stop();
    expect(captured?.message).toBe('boom');
  });
  it('throws when archiveDir or intervalMs is missing', () => {
    let threw = false;
    try {
      createBackupScheduler({ store: createMemoryStore() });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
