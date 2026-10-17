// The server's store at scale: the `.lino` text log appends what changed
// instead of rewriting the file, the binary doublets file is a snapshot
// written on an interval, and the dual store repairs a snapshot that
// missed the last writes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createDoubletsStore,
  createDualStore,
  createLinoTextStore,
  decodeArchive,
} from '../src/storage/index.js';
import {
  applyLinoRecords,
  tombstoneRecord,
} from '../src/storage/lino-store.js';
import { startServer } from '../src/server/index.js';

const tmpdir = () => fs.mkdtemp(path.join(os.tmpdir(), 'ms-append-'));

const message = (n, extra = {}) => ({
  id: `msg:telegram:1:${n}`,
  tokens: ['msg', 'telegram', '1', String(n)],
  body: `line ${n}\n"quoted"`,
  raw: { className: 'Message', id: n, entities: [{ offset: 0, length: 4 }] },
  ...extra,
});

test('a put appends to the text log; earlier bytes stay as they were', async () => {
  const file = path.join(await tmpdir(), 'data.lino');
  const store = await createLinoTextStore(file);
  await store.putMany([message(1), message(2)]);
  const before = await fs.readFile(file, 'utf8');
  await store.put(message(3));
  const after = await fs.readFile(file, 'utf8');
  assert.ok(after.startsWith(before), 'appended, not rewritten');
  assert.equal(after.trim().split('\n').length, 3);
  const again = await createLinoTextStore(file);
  assert.deepEqual(await again.query(), [message(1), message(2), message(3)]);
});

test('a later record wins and a tombstone deletes, across reopen', async () => {
  const file = path.join(await tmpdir(), 'data.lino');
  const store = await createLinoTextStore(file);
  await store.putMany([message(1), message(2), message(3)]);
  await store.put(message(2, { body: 'edited' }));
  assert.equal(await store.delete('msg:telegram:1:1'), true);
  assert.equal(await store.delete('missing'), false);
  const text = await fs.readFile(file, 'utf8');
  assert.equal(text.trim().split('\n').length, 5, '3 puts, 1 edit, 1 delete');
  const again = await createLinoTextStore(file);
  assert.deepEqual(await again.query(), [
    message(2, { body: 'edited' }),
    message(3),
  ]);
  // Deleted and put again: it comes back, last in order (as in memory).
  await again.put(message(1));
  const third = await createLinoTextStore(file);
  assert.deepEqual(
    (await third.query()).map((l) => l.id),
    ['msg:telegram:1:2', 'msg:telegram:1:3', 'msg:telegram:1:1']
  );
});

test('tombstones are only the two-key shape', () => {
  assert.deepEqual(tombstoneRecord('a'), { id: 'a', '~deleted': true });
  const link = { id: 'a', tokens: [], '~deleted': true };
  assert.deepEqual(applyLinoRecords([link]), [link], 'a link, not a delete');
  assert.deepEqual(applyLinoRecords([link, tombstoneRecord('a')]), []);
});

test('superseded lines are compacted away, keeping every link', async () => {
  const file = path.join(await tmpdir(), 'data.lino');
  const store = await createLinoTextStore(file, { compactAfter: 10 });
  await store.putMany([message(1), message(2)]);
  for (let i = 0; i < 20; i += 1) {
    await store.put(message(1, { body: `edit ${i}` }));
  }
  const lines = (await fs.readFile(file, 'utf8')).trim().split('\n');
  assert.ok(lines.length < 15, `compacted (${lines.length} lines)`);
  const again = await createLinoTextStore(file);
  assert.deepEqual(await again.query(), [
    message(1, { body: 'edit 19' }),
    message(2),
  ]);
  await again.compact();
  assert.equal((await fs.readFile(file, 'utf8')).trim().split('\n').length, 2);
});

test('a mostly superseded file is compacted when opened', async () => {
  const file = path.join(await tmpdir(), 'data.lino');
  const writer = await createLinoTextStore(file, { compactAfter: 1000 });
  for (let i = 0; i < 30; i += 1) {
    await writer.put(message(1, { body: `edit ${i}` }));
  }
  assert.equal((await fs.readFile(file, 'utf8')).trim().split('\n').length, 30);
  const reader = await createLinoTextStore(file, { compactAfter: 10 });
  assert.equal((await fs.readFile(file, 'utf8')).trim().split('\n').length, 1);
  assert.equal((await reader.get('msg:telegram:1:1')).body, 'edit 29');
});

test('a line torn by a crash mid-append is skipped, later writes are kept', async () => {
  const file = path.join(await tmpdir(), 'data.lino');
  const store = await createLinoTextStore(file);
  await store.put(message(1));
  await fs.appendFile(file, '(o: (id "msg:telegram:1:2") (bo');
  const again = await createLinoTextStore(file);
  assert.deepEqual(await again.query(), [message(1)]);
  await again.put(message(3));
  const third = await createLinoTextStore(file);
  assert.deepEqual(await third.query(), [message(1), message(3)]);
});

test('a legacy indented file is read and rewritten as records', async () => {
  const file = path.join(await tmpdir(), 'data.lino');
  await fs.writeFile(file, 'a x y\n  child b\n');
  const store = await createLinoTextStore(file);
  assert.deepEqual(await store.get('a'), {
    id: 'a',
    tokens: ['x', 'y'],
    children: ['b'],
  });
  await store.put({ id: 'c', tokens: ['z'] });
  const text = await fs.readFile(file, 'utf8');
  assert.ok(
    text
      .split('\n')
      .filter(Boolean)
      .every((l) => l.startsWith('('))
  );
  const again = await createLinoTextStore(file);
  assert.deepEqual(
    (await again.query()).map((l) => l.id),
    ['a', 'c']
  );
});

test('the binary snapshot is written on an interval, and at once on flush', async () => {
  const file = path.join(await tmpdir(), 'data.bin');
  const store = await createDoubletsStore(file, { minIntervalMs: 200 });
  await store.put(message(1)); // the first change after a quiet spell
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(decodeArchive(await fs.readFile(file)).length, 1);
  await store.put(message(2));
  await store.put(message(3));
  // Within the interval: not written yet, and the puts did not wait.
  assert.equal(decodeArchive(await fs.readFile(file)).length, 1);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(decodeArchive(await fs.readFile(file)).length, 3);
  await store.delete('msg:telegram:1:1');
  await store.flush();
  assert.deepEqual(
    decodeArchive(await fs.readFile(file)).map((l) => l.id),
    ['msg:telegram:1:2', 'msg:telegram:1:3']
  );
});

test('reconcile repairs a binary snapshot that missed the last writes', async () => {
  const dir = await tmpdir();
  const open = async () =>
    createDualStore({
      text: await createLinoTextStore(path.join(dir, 'data.lino')),
      binary: await createDoubletsStore(path.join(dir, 'data.bin'), {
        minIntervalMs: 60_000,
      }),
    });
  const first = await open();
  await first.putMany([message(1), message(2)]);
  await first.flush();
  // After the snapshot: an edit, a new link and a delete — then a "crash".
  await first.put(message(2, { body: 'edited' }));
  await first.put(message(3));
  await first.delete('msg:telegram:1:1');
  const second = await open();
  assert.equal((await second.verify()).length, 3, 'the snapshot is stale');
  assert.deepEqual(await second.reconcile(), { put: 2, deleted: 1 });
  assert.deepEqual(await second.verify(), []);
  assert.deepEqual(
    decodeArchive(await fs.readFile(path.join(dir, 'data.bin'))).map(
      (l) => l.id
    ),
    ['msg:telegram:1:2', 'msg:telegram:1:3']
  );
  assert.deepEqual(await second.reconcile(), { put: 0, deleted: 0 });
});

test('the server reconciles on start and writes the snapshot on close', async () => {
  const storeDir = await tmpdir();
  const lino = path.join(storeDir, 'data.lino');
  const text = await createLinoTextStore(lino);
  await text.put(message(1)); // written while the binary file is absent
  const handle = await startServer({ storeDir, enableSync: false });
  assert.equal(
    (await handle.store.get('msg:telegram:1:1')).body,
    message(1).body
  );
  await handle.store.put(message(2));
  await handle.close();
  const ids = decodeArchive(
    await fs.readFile(path.join(storeDir, 'data.bin'))
  ).map((l) => l.id);
  assert.ok(ids.includes('msg:telegram:1:1'), 'repaired from the text log');
  assert.ok(ids.includes('msg:telegram:1:2'), 'written on close');
});
