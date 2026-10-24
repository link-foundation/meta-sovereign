import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/index.js';
import { createBackupScheduler } from '../src/storage/backup.js';

// A store whose every call takes a moment, so a run is still in flight
// when the scheduler is stopped.
const slow = (store) =>
  new Proxy(store, {
    get: (target, name) =>
      typeof target[name] === 'function'
        ? async (...args) => {
            await new Promise((r) => setTimeout(r, 20));
            return target[name](...args);
          }
        : target[name],
  });

describe('createBackupScheduler stop', () => {
  it('waits for the run in flight, which then prunes before it ends', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-stop-'));
    const store = createMemoryStore();
    await store.put({ id: 'a', tokens: ['x'] });
    const done = [];
    const sched = createBackupScheduler({
      store: slow(store),
      archiveDir: dir,
      intervalMs: 60_000,
      keep: 1,
      onBackup: (f) => done.push(f),
    });
    const first = sched.runNow();
    // A second request while one runs joins it, it does not start another.
    expect(sched.runNow()).toBe(first);
    await sched.stop();
    expect(done.length).toBe(1);
    const files = (await fs.readdir(dir)).filter((f) =>
      f.startsWith('meta-sovereign-')
    );
    expect(files.length).toBe(1);
  });
  it('stops at once when nothing runs', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-stop2-'));
    const sched = createBackupScheduler({
      store: createMemoryStore(),
      archiveDir: dir,
      intervalMs: 60_000,
    });
    await sched.stop();
    expect((await fs.readdir(dir)).length).toBe(0);
  });
});
