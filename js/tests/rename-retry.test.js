// Renames over a busy file on Windows (R-Z19): fakes only, every OS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renameDurable, writeFileDurable } from '../src/storage/durable.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { assertMode } from './helpers/mode.js';

const tmpdir = () => fs.mkdtemp(path.join(os.tmpdir(), 'rename-retry-'));
const busy = (code = 'EPERM') => Object.assign(new Error(code), { code });
// A rename failing `times` times with `code`, then the real one.
const flaky = (times, code = 'EPERM') => {
  const rename = async (from, to) => {
    rename.calls += 1;
    if (rename.calls <= times) {
      throw busy(code);
    }
    return fs.rename(from, to);
  };
  rename.calls = 0;
  return rename;
};
const fast = { platform: 'win32', sleep: async () => {} };
const message = (n, extra = {}) => ({
  id: `msg:t:${n}`,
  tokens: [],
  body: `m${n}`,
  ...extra,
});

test('win32: EPERM/EBUSY/EACCES are retried until the rename succeeds', async () => {
  for (const code of ['EPERM', 'EBUSY', 'EACCES']) {
    const dir = await tmpdir();
    await fs.writeFile(path.join(dir, 'a'), 'new');
    await fs.writeFile(path.join(dir, 'b'), 'old');
    const rename = flaky(4, code);
    await renameDurable(path.join(dir, 'a'), path.join(dir, 'b'), {
      ...fast,
      rename,
    });
    assert.equal(rename.calls, 5);
    assert.equal(await fs.readFile(path.join(dir, 'b'), 'utf8'), 'new');
  }
});

test('win32: gives up after the attempts, the old file untouched, the code kept', async () => {
  const dir = await tmpdir();
  await fs.writeFile(path.join(dir, 'a'), 'new');
  await fs.writeFile(path.join(dir, 'b'), 'old');
  const rename = flaky(Infinity);
  await assert.rejects(
    renameDurable(path.join(dir, 'a'), path.join(dir, 'b'), {
      ...fast,
      rename,
    }),
    { code: 'EPERM' }
  );
  assert.equal(rename.calls, 10);
  assert.equal(await fs.readFile(path.join(dir, 'b'), 'utf8'), 'old');
});

test('the pauses grow and stay near a second in all', async () => {
  const pauses = [];
  await assert.rejects(
    renameDurable('a', 'b', {
      platform: 'win32',
      rename: flaky(Infinity),
      sleep: async (ms) => pauses.push(ms),
    })
  );
  assert.equal(pauses.length, 9);
  const total = pauses.reduce((a, b) => a + b, 0);
  assert.ok(total >= 500 && total <= 1000, `total ${total}`);
});

test('POSIX: EPERM is a real error (no retry), EBUSY is retried', async () => {
  const eperm = flaky(Infinity);
  await assert.rejects(
    renameDurable('a', 'b', { ...fast, platform: 'linux', rename: eperm }),
    { code: 'EPERM' }
  );
  assert.equal(eperm.calls, 1);
  const dir = await tmpdir();
  await fs.writeFile(path.join(dir, 'a'), 'x');
  const ebusy = flaky(2, 'EBUSY');
  await renameDurable(path.join(dir, 'a'), path.join(dir, 'b'), {
    platform: 'linux',
    rename: ebusy,
    sleep: async () => {},
  });
  assert.equal(ebusy.calls, 3);
});

test('other errors are not retried', async () => {
  const rename = flaky(Infinity, 'ENOENT');
  await assert.rejects(renameDurable('a', 'b', { ...fast, rename }), {
    code: 'ENOENT',
  });
  assert.equal(rename.calls, 1);
});

test('writeFileDurable keeps the old file and removes its temp on failure', async () => {
  const dir = await tmpdir();
  const file = path.join(dir, 'x.json');
  await writeFileDurable(file, 'old');
  await writeFileDurable(file, 'new', { rename: flaky(0) });
  assert.equal(await fs.readFile(file, 'utf8'), 'new');
  await assertMode(file, 0o600);
  await assert.rejects(
    writeFileDurable(file, 'newer', {
      rename: async () => {
        throw busy('ENOSPC');
      },
    }),
    { code: 'ENOSPC' }
  );
  assert.equal(await fs.readFile(file, 'utf8'), 'new');
  assert.deepEqual(await fs.readdir(dir), ['x.json']);
});

test('a compaction that cannot rename keeps every link, reports, and retries later', async () => {
  const dir = await tmpdir();
  const file = path.join(dir, 'data.lino');
  const events = [];
  let failing = true;
  const rename = async (from, to) => {
    if (failing) {
      throw busy('EPERM');
    }
    return fs.rename(from, to);
  };
  const unhandled = [];
  const onUnhandled = (e) => unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  const store = await createLinoTextStore(file, {
    compactAfter: 5,
    rename,
    onEvent: (e) => events.push(e),
  });
  await store.putMany([message(1), message(2)]);
  for (let i = 0; i < 12; i += 1) {
    await store.put(message(1, { body: `edit ${i}` })); // never throws
  }
  assert.ok(events.some((e) => e.event === 'compaction_failed' && e.code));
  const again = await createLinoTextStore(file);
  assert.deepEqual(await again.query(), [
    message(1, { body: 'edit 11' }),
    message(2),
  ]);
  assert.deepEqual(
    (await fs.readdir(dir)).filter((n) => n.endsWith('.tmp')),
    []
  );
  // Appending still works on the old file, and a later compaction succeeds.
  failing = false;
  await store.put(message(3));
  await store.compact();
  assert.equal((await fs.readFile(file, 'utf8')).trim().split('\n').length, 3);
  await new Promise((resolve) => setTimeout(resolve, 20));
  process.off('unhandledRejection', onUnhandled);
  assert.deepEqual(unhandled, []);
});

test('compaction succeeds after readers of the same file were closed', async () => {
  const dir = await tmpdir();
  const file = path.join(dir, 'data.lino');
  const store = await createLinoTextStore(file, { compactAfter: 3 });
  await store.putMany([message(1), message(2)]);
  const reader = await createLinoTextStore(file);
  await reader.query();
  for (let i = 0; i < 8; i += 1) {
    await store.put(message(1, { body: `e${i}` }));
  }
  const lines = (await fs.readFile(file, 'utf8')).trim().split('\n');
  assert.ok(lines.length < 8, `compacted (${lines.length})`);
});
