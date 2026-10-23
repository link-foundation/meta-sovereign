// R-Z2: the store survives power cuts, two processes, corrupt lines and
// loose permissions; backups are atomic and keep secrets out unless they
// are encrypted. Temp folders and fakes only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

import { createLinoTextStore } from '../src/storage/lino-store.js';
import { openDualStore } from '../src/storage/dual-store.js';
import { createMemoryStore } from '../src/storage/index.js';
import {
  makeBackup,
  pruneBackups,
  restoreBackup,
  verifyBackup,
} from '../src/storage/backup.js';
import { writeFileDurable } from '../src/storage/durable.js';

const tmp = (name) => fs.mkdtemp(path.join(os.tmpdir(), `ms-z2-${name}-`));
const mode = async (file) => (await fs.stat(file)).mode & 0o777;
const link = (i) => ({
  id: `msg:z:${i}`,
  tokens: ['msg', 'z', `${i}`],
  body: `b${i}`,
});

// Count the fsyncs the process makes (every FileHandle goes through one).
const countSyncs = async () => {
  const probe = await fs.open(os.tmpdir(), 'r');
  const proto = Object.getPrototypeOf(probe);
  await probe.close();
  const original = proto.sync;
  const calls = { n: 0 };
  proto.sync = function counted(...args) {
    calls.n += 1;
    return original.apply(this, args);
  };
  return { calls, restore: () => (proto.sync = original) };
};

test('appends are flushed in groups, not once per link', async () => {
  const dir = await tmp('sync');
  const spy = await countSyncs();
  try {
    const store = await createLinoTextStore(path.join(dir, 'data.lino'), {
      syncMs: 20,
    });
    await Promise.all(
      Array.from({ length: 2000 }, (_, i) => store.put(link(i)))
    );
    await store.flush();
    assert.ok(spy.calls.n >= 1, 'the log is flushed to disk');
    assert.ok(spy.calls.n < 20, `group commit, not per link (${spy.calls.n})`);
  } finally {
    spy.restore();
  }
});

test('a compaction flushes its temp file before the rename', async () => {
  const dir = await tmp('compact');
  const file = path.join(dir, 'data.lino');
  const store = await createLinoTextStore(file, { syncMs: 10_000 });
  await store.put(link(1));
  await store.put(link(1));
  const spy = await countSyncs();
  try {
    await store.compact();
    assert.ok(spy.calls.n >= 2, 'temp file and directory are flushed');
  } finally {
    spy.restore();
  }
  assert.equal((await fs.readFile(file, 'utf8')).trim().split('\n').length, 1);
  assert.equal(await mode(file), 0o600);
  assert.deepEqual(
    (await fs.readdir(dir)).filter((n) => n.endsWith('.tmp')),
    []
  );
});

test('writeFileDurable leaves a private whole file and no temp', async () => {
  const dir = await tmp('durable');
  const file = path.join(dir, 'sub', 'x.bin');
  await writeFileDurable(file, 'hello');
  assert.equal(await fs.readFile(file, 'utf8'), 'hello');
  assert.equal(await mode(file), 0o600);
  assert.equal(await mode(path.dirname(file)), 0o700);
  assert.deepEqual(await fs.readdir(path.dirname(file)), ['x.bin']);
});

test('a corrupt line in the middle is kept in quarantine, never compacted away', async () => {
  const dir = await tmp('corrupt');
  const file = path.join(dir, 'data.lino');
  const seed = await createLinoTextStore(file);
  await seed.put(link(1));
  await seed.put(link(2));
  await seed.flush();
  const lines = (await fs.readFile(file, 'utf8')).trimEnd().split('\n');
  const garbled = '(o: (id "msg:z:SECRET-BODY") (tokens broken';
  await fs.writeFile(file, [lines[0], garbled, lines[1], ''].join('\n'));

  const heard = [];
  const store = await createLinoTextStore(file, {
    onCorrupt: (info) => heard.push(info),
  });
  assert.equal(store.corruptLines(), 1);
  assert.equal(heard[0].count, 1);
  assert.ok(!JSON.stringify(heard).includes('SECRET-BODY'), 'never the text');
  assert.equal((await store.query()).length, 2);

  await store.compact();
  const rewritten = await fs.readFile(file, 'utf8');
  assert.ok(!rewritten.includes('SECRET-BODY'));
  const kept = (await fs.readdir(dir)).filter((n) => n.includes('.corrupt-'));
  assert.equal(kept.length, 1);
  const quarantine = path.join(dir, kept[0]);
  assert.ok((await fs.readFile(quarantine, 'utf8')).includes(garbled));
  assert.equal(await mode(quarantine), 0o600);
  assert.equal(heard.at(-1).quarantined, true);

  // The next open is clean and the quarantine file is not written again.
  const again = await createLinoTextStore(file);
  assert.equal(again.corruptLines(), 0);
});

test('a torn last line is counted and quarantined too', async () => {
  const dir = await tmp('torn');
  const file = path.join(dir, 'data.lino');
  const seed = await createLinoTextStore(file);
  await seed.put(link(1));
  await seed.flush();
  await fs.appendFile(file, '(o: (id "msg:z:2") (tok');
  const store = await createLinoTextStore(file);
  assert.equal(store.corruptLines(), 1);
  await store.put(link(3)); // appended after the torn line, on a new line
  await store.compact();
  assert.equal((await store.query()).length, 2);
  assert.equal(
    (await fs.readdir(dir)).filter((n) => n.includes('.corrupt-')).length,
    1
  );
});

test('opening a store tightens older loose files and folders', async () => {
  const dir = await tmp('perm');
  await fs.mkdir(path.join(dir, 'logs'));
  await fs.mkdir(path.join(dir, 'archives'));
  for (const name of [
    'data.lino',
    'data.bin',
    'logs/a.log',
    'archives/b.json',
  ]) {
    await fs.writeFile(path.join(dir, name), '');
    await fs.chmod(path.join(dir, name), 0o644);
  }
  await fs.chmod(path.join(dir, 'logs'), 0o755);
  await fs.mkdir(path.join(dir, 'media', 'telegram', 'a'), { recursive: true });
  await fs.writeFile(path.join(dir, 'media', 'telegram', 'a', 'p.jpg'), '');
  for (const rel of ['media', 'media/telegram', 'media/telegram/a']) {
    await fs.chmod(path.join(dir, rel), 0o755);
  }
  await fs.chmod(path.join(dir, 'media', 'telegram', 'a', 'p.jpg'), 0o644);
  await openDualStore(dir);
  assert.equal(await mode(path.join(dir, 'media')), 0o700);
  assert.equal(await mode(path.join(dir, 'media/telegram/a')), 0o700);
  assert.equal(await mode(path.join(dir, 'media/telegram/a/p.jpg')), 0o600);
  for (const name of [
    'data.lino',
    'data.bin',
    'logs/a.log',
    'archives/b.json',
  ]) {
    assert.equal(await mode(path.join(dir, name)), 0o600, name);
  }
  assert.equal(await mode(path.join(dir, 'logs')), 0o700);
  assert.equal(await mode(dir), 0o700);
  assert.equal(await mode(path.join(dir, 'data.lock')), 0o600);
});

const holder = (dir) =>
  new Promise((resolve, reject) => {
    const src = `
      import { openDualStore } from ${JSON.stringify(new URL('../src/storage/dual-store.js', import.meta.url).href)};
      await openDualStore(${JSON.stringify(dir)});
      console.log('ready');
      setInterval(() => {}, 1000);`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', src], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    child.stdout.once('data', () => resolve(child));
    child.once('error', reject);
  });

test('a second process fails fast; read-only still works; a stale lock is taken over', async () => {
  const dir = await tmp('lock');
  const child = await holder(dir);
  try {
    const writer = await openDualStore(dir).then(
      () => null,
      (error) => error
    );
    assert.equal(writer?.code, 'STORE_LOCKED');
    assert.ok(writer.message.includes(String(child.pid)));
    // Read-only: no lock, works while the other process owns the store.
    const reader = await openDualStore(dir, { readOnly: true });
    assert.deepEqual(await reader.query(), []);
    await assert.rejects(reader.put(link(1)), { code: 'STORE_READ_ONLY' });
  } finally {
    child.kill('SIGKILL');
    await new Promise((resolve) => child.once('exit', resolve));
  }
  // The killed process left its lock behind: stale, taken over.
  assert.ok(
    (await fs.readFile(path.join(dir, 'data.lock'), 'utf8')).length > 0
  );
  const store = await openDualStore(dir);
  await store.put(link(1));
  assert.equal((await store.query()).length, 1);
});

test('a read-only open never compacts or writes', async () => {
  const dir = await tmp('ro');
  const file = path.join(dir, 'data.lino');
  const seed = await createLinoTextStore(file);
  for (let i = 0; i < 30; i += 1) {
    await seed.put(link(1));
  }
  await seed.flush();
  const before = await fs.readFile(file, 'utf8');
  const ro = await createLinoTextStore(file, {
    readOnly: true,
    compactAfter: 1,
  });
  assert.equal((await ro.query()).length, 1);
  assert.equal(await fs.readFile(file, 'utf8'), before);
});

test('plain backups leave secrets out and say so; encrypted ones keep them', async () => {
  const dir = await tmp('bk');
  const store = createMemoryStore();
  await store.put({ id: 'msg:1', tokens: ['msg', '1'] });
  await store.put({
    id: 'secret:telegram:session',
    tokens: [],
    value: 'S3CR3T',
  });
  const plain = await makeBackup(store, { archiveDir: dir });
  assert.equal(plain.secrets, 'excluded');
  assert.equal(plain.secretsExcluded, 1);
  const text = await fs.readFile(plain.file, 'utf8');
  assert.ok(!text.includes('S3CR3T'));
  assert.equal(JSON.parse(text).secrets, 'excluded');
  assert.equal(await mode(plain.file), 0o600);

  const enc = await makeBackup(store, {
    archiveDir: dir,
    passphrase: 'pp',
    now: new Date(Date.now() + 5000),
  });
  assert.equal(enc.secrets, 'included-encrypted');
  const target = createMemoryStore();
  await restoreBackup(target, enc.file, { passphrase: 'pp' });
  assert.equal((await target.get('secret:telegram:session')).value, 'S3CR3T');
});

test('pruning never deletes while the newest archive is incomplete', async () => {
  const dir = await tmp('prune');
  const store = createMemoryStore();
  await store.put({ id: 'a', tokens: [] });
  for (let i = 0; i < 3; i += 1) {
    await makeBackup(store, {
      archiveDir: dir,
      now: new Date(Date.now() + i * 1000),
    });
  }
  const names = (await fs.readdir(dir)).sort();
  // A crash left the newest one truncated.
  const newest = path.join(dir, names.at(-1));
  await fs.writeFile(newest, (await fs.readFile(newest, 'utf8')).slice(0, 20));
  assert.equal(await verifyBackup(newest), false);
  assert.deepEqual(await pruneBackups({ archiveDir: dir, keep: 1 }), []);
  assert.equal((await fs.readdir(dir)).length, 3);
  // A good newest archive allows pruning again.
  await makeBackup(store, {
    archiveDir: dir,
    now: new Date(Date.now() + 9000),
  });
  assert.equal((await pruneBackups({ archiveDir: dir, keep: 2 })).length, 2);
  assert.deepEqual(await pruneBackups({ archiveDir: dir, keep: 0 }), []);
});

test('restore refuses a malformed manifest before writing anything', async () => {
  const dir = await tmp('restore');
  const file = path.join(dir, 'meta-sovereign-x.json');
  await fs.writeFile(file, JSON.stringify({ links: [{ id: 'ok' }, 'junk'] }));
  const target = createMemoryStore();
  await assert.rejects(restoreBackup(target, file), { code: 'BACKUP_INVALID' });
  assert.deepEqual(await target.query(), []);
});
