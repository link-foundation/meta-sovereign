// Opening a store folder migrates it, safely (R-Z17): version 0 -> current,
// idempotent, rolled back by truncating the log, refused when too new or
// when the disk is short, compaction held, read-only never migrates.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDualStore } from '../src/storage/dual-store.js';
import { JOURNAL } from '../src/storage/migrations/node-runner.js';
import { SCHEMA_ID, schemaLink } from '../src/storage/migrations/index.js';
import { formatLinoRecords } from '../src/storage/lino-store.js';
import {
  dataOf,
  goodMigration,
  oldLinks,
  secondMigration,
  stoppingMigration,
  tmpdir,
  writeOldStore,
} from './helpers/test-migrations.mjs';

const open = (dir, options = {}) =>
  openDualStore(dir, { migrations: [goodMigration], current: 1, ...options });

// A process that dies half way through a migration, leaving the journal.
const crashChild = (dir) => {
  const script = fileURLToPath(
    new URL('./helpers/migrate-crash-child.mjs', import.meta.url)
  );
  return spawnSync(
    process.execPath,
    globalThis.Deno ? ['run', '-A', script, dir] : [script, dir],
    { encoding: 'utf8' }
  );
};

const logOf = (dir) => fs.readFile(path.join(dir, 'data.lino'));

const exists = (file) =>
  fs.stat(file).then(
    () => true,
    () => false
  );

// What a clean, uninterrupted run leaves.
const cleanRun = async () => {
  const dir = await writeOldStore(await tmpdir());
  const store = await open(dir);
  const data = await dataOf(store);
  await store.flush();
  store.close();
  return data;
};

test('a version 0 store is migrated at open and is then at the current version', async () => {
  const dir = await writeOldStore(await tmpdir());
  const events = [];
  const store = await open(dir, { onEvent: (e) => events.push(e) });
  assert.deepEqual(
    { v: store.schema.version, c: store.schema.current },
    { v: 1, c: 1 }
  );
  assert.ok(
    (await dataOf(store)).every((l) => l.shape === 1),
    'every message is in the new shape'
  );
  const schema = await store.get(SCHEMA_ID);
  assert.equal(schema.version, 1);
  assert.equal(schema.applied[0].id, '0001-test-shape');
  assert.equal(schema.applied[0].changed, 40);
  assert.deepEqual(
    events.map((e) => e.event).filter((e) => e.startsWith('migration_')),
    ['migration_started', 'migration_step', 'migration_done']
  );
  const step = events.find((e) => e.event === 'migration_step');
  assert.deepEqual(
    [step.id, step.scanned, step.changed],
    ['0001-test-shape', 40, 40]
  );
  assert.equal(await exists(path.join(dir, JOURNAL)), false);
  store.close();
});

test('opening again runs nothing; the data is the same', async () => {
  const dir = await writeOldStore(await tmpdir());
  const first = await open(dir);
  const data = await dataOf(first);
  await first.flush();
  first.close();
  const events = [];
  const second = await open(dir, { onEvent: (e) => events.push(e.event) });
  assert.equal(second.migration, null);
  assert.deepEqual(events, []);
  assert.deepEqual(await dataOf(second), data);
  second.close();
});

test('a migration that fails puts the log back byte for byte; a later open succeeds identically', async () => {
  const dir = await writeOldStore(await tmpdir());
  const before = await logOf(dir);
  const events = [];
  await assert.rejects(
    open(dir, {
      migrations: [stoppingMigration(3)],
      onEvent: (e) => events.push(e.event),
    }),
    { code: 'MIGRATION_FAILED', migration: '0001-test-shape' }
  );
  assert.ok(events.includes('migration_failed'));
  assert.ok(events.includes('migration_rolled_back'));
  assert.deepEqual(await logOf(dir), before, 'data.lino is as it was');
  assert.equal(await exists(path.join(dir, JOURNAL)), false);
  assert.equal(await exists(path.join(dir, 'data.bin')), false);
  // The lock was let go: the next open works and equals a clean run.
  const store = await open(dir);
  assert.deepEqual(await dataOf(store), await cleanRun());
  store.close();
});

test('a process that dies mid-migration: the next open truncates to the journal and finishes', async () => {
  const dir = await writeOldStore(await tmpdir());
  const before = await logOf(dir);
  const child = crashChild(dir);
  assert.equal(child.status, 9, child.stderr);
  // Left behind: the journal, and a log that grew.
  const journal = JSON.parse(
    await fs.readFile(path.join(dir, JOURNAL), 'utf8')
  );
  assert.equal(journal.logBytes, before.length);
  assert.equal(journal.step, '0001-test-shape');
  assert.ok((await logOf(dir)).length > before.length, 'the log grew');
  const events = [];
  const store = await open(dir, { onEvent: (e) => events.push(e) });
  const rolled = events.find((e) => e.event === 'migration_rolled_back');
  assert.ok(rolled.truncated > 0, 'bytes were cut off');
  assert.deepEqual(await dataOf(store), await cleanRun());
  assert.equal(store.schema.version, 1);
  assert.equal(await exists(path.join(dir, JOURNAL)), false);
  store.close();
});

test('a step that finished stays done when a later one fails', async () => {
  const dir = await writeOldStore(await tmpdir());
  const failing = {
    ...secondMigration,
    async up(ctx) {
      await ctx.scan({ prefix: 'msg:test:' }, async (batch) => {
        await ctx.putMany(batch.map((l) => ({ ...l, shape: 2 })));
      });
      throw new Error('late');
    },
  };
  await assert.rejects(
    open(dir, { migrations: [goodMigration, failing], current: 2 }),
    { code: 'MIGRATION_FAILED', migration: '0002-test-second' }
  );
  const store = await open(dir, {
    migrations: [goodMigration, secondMigration],
    current: 2,
  });
  // Step one was kept (the journal moved forward), step two ran after.
  const schema = await store.get(SCHEMA_ID);
  assert.deepEqual(
    schema.applied.map((a) => a.id),
    ['0001-test-shape', '0002-test-second']
  );
  assert.ok((await dataOf(store)).every((l) => l.shape === 2));
  assert.ok(
    (await dataOf(store)).every((l) => l.body.endsWith('(v1)')),
    'step one ran once, not again'
  );
  store.close();
});

test('a store from a newer version is refused, writer and read-only, and never written', async () => {
  const dir = await tmpdir();
  await writeOldStore(dir, [
    ...oldLinks(3),
    schemaLink({ version: 9, applied: [] }),
  ]);
  const before = await logOf(dir);
  const events = [];
  await assert.rejects(open(dir, { onEvent: (e) => events.push(e.event) }), {
    code: 'STORE_TOO_NEW',
    found: 9,
  });
  assert.ok(events.includes('schema_too_new'));
  await assert.rejects(open(dir, { readOnly: true }), {
    code: 'STORE_TOO_NEW',
    message: /update the app/,
  });
  assert.deepEqual(await logOf(dir), before);
  assert.equal(await exists(path.join(dir, JOURNAL)), false);
  assert.equal(await exists(path.join(dir, 'data.lock')), false);
});

test('a read-only open of an older store reads it as it is and says so', async () => {
  const dir = await writeOldStore(await tmpdir());
  const before = await logOf(dir);
  const events = [];
  const store = await open(dir, {
    readOnly: true,
    onEvent: (e) => events.push(e),
  });
  assert.equal(store.schema.version, 0);
  assert.equal((await store.query()).length, 40);
  assert.equal(events[0].event, 'schema_old_read_only');
  assert.deepEqual(await logOf(dir), before);
});

test('too little free disk: LOW_DISK, nothing changed, no journal', async () => {
  const dir = await writeOldStore(await tmpdir());
  const before = await logOf(dir);
  const events = [];
  await assert.rejects(
    open(dir, {
      measureFree: async () => 10 * 1024 * 1024,
      onEvent: (e) => events.push(e),
    }),
    { code: 'LOW_DISK', message: /free some space/i }
  );
  assert.equal(events.at(-1).event, 'migration_refused');
  assert.deepEqual(await logOf(dir), before);
  assert.equal(await exists(path.join(dir, JOURNAL)), false);
  // The estimate is a tenth of the log and 256 MB: just enough passes.
  const enough = 256 * 1024 * 1024 + Math.ceil(before.length / 10);
  const store = await open(dir, { measureFree: async () => enough });
  assert.equal(store.schema.version, 1);
  store.close();
});

test('compaction is held while migrating: the log is only appended to', async () => {
  // 3000 links, each rewritten 3 times by the migration: far more
  // superseded lines than live ones, which would trigger a compaction.
  const dir = await writeOldStore(await tmpdir(), oldLinks(3000));
  const before = await logOf(dir);
  const noisy = {
    ...goodMigration,
    async up(ctx) {
      for (const round of [1, 2, 3]) {
        await ctx.scan({ prefix: 'msg:test:' }, async (batch) => {
          await ctx.putMany(batch.map((l) => ({ ...l, round })));
        });
      }
    },
  };
  const store = await open(dir, { migrations: [noisy] });
  const after = await logOf(dir);
  assert.ok(after.length > before.length * 3);
  assert.ok(
    after.subarray(0, before.length).equals(before),
    'the old bytes are still the start of the log'
  );
  // Compaction is allowed again once the migration is over.
  store.close();
});

test('the binary snapshot is rebuilt after a rollback', async () => {
  const dir = await writeOldStore(await tmpdir());
  await fs.writeFile(path.join(dir, 'data.bin'), 'stale');
  await assert.rejects(open(dir, { migrations: [stoppingMigration(2)] }));
  assert.equal(await exists(path.join(dir, 'data.bin')), false);
  const store = await open(dir);
  await store.flush();
  assert.ok((await fs.stat(path.join(dir, 'data.bin'))).size > 5);
  store.close();
});

test('an empty store is not stamped; data written later is migrated safely', async () => {
  const dir = await tmpdir();
  const store = await open(dir);
  assert.equal(await store.get(SCHEMA_ID), null);
  assert.equal(store.migration, null);
  await store.put(oldLinks(1)[0]);
  await store.flush();
  store.close();
  const again = await open(dir);
  assert.equal(again.schema.version, 1);
  again.close();
});

test('an old-format log (indented text) is rewritten before the journal is taken', async () => {
  const dir = await tmpdir();
  await fs.writeFile(
    path.join(dir, 'data.lino'),
    'msg:test:1 message test 1\n  child sender:test:a\nmsg:test:2 message test 2\n'
  );
  const store = await open(dir);
  assert.equal(store.schema.version, 1);
  assert.equal((await dataOf(store)).length, 2);
  store.close();
  // Reads back as records.
  assert.match((await logOf(dir)).toString('utf8'), /^\(/);
  assert.equal(formatLinoRecords([]).length, 0);
});

// A journal that does not describe the log is never acted on (R-Z17).
const leaveJournal = async (change) => {
  const dir = await writeOldStore(await tmpdir());
  const child = crashChild(dir);
  assert.equal(child.status, 9, child.stderr);
  const file = path.join(dir, JOURNAL);
  const journal = JSON.parse(await fs.readFile(file, 'utf8'));
  await change(dir, journal, file);
  return dir;
};

test('a log shorter than the journal says is not truncated, nor opened', async () => {
  const dir = await leaveJournal(async (d, journal, file) => {
    journal.logBytes = (await logOf(d)).length + 100;
    await fs.writeFile(file, JSON.stringify(journal));
  });
  const before = await logOf(dir);
  await assert.rejects(open(dir), { code: 'MIGRATION_FAILED' });
  assert.deepEqual(await logOf(dir), before, 'not a byte cut');
  assert.equal(await exists(path.join(dir, JOURNAL)), true);
});

test('a journal for another file or another ending is not acted on', async () => {
  const dir = await leaveJournal(async (d, journal, file) => {
    journal.tail = '00'.repeat(8);
    await fs.writeFile(file, JSON.stringify(journal));
  });
  const before = await logOf(dir);
  await assert.rejects(open(dir), { code: 'MIGRATION_FAILED' });
  assert.deepEqual(await logOf(dir), before);
  const mid = await leaveJournal(async (d, journal, file) => {
    journal.logBytes -= 3; // not a line boundary
    await fs.writeFile(file, JSON.stringify(journal));
  });
  const kept = await logOf(mid);
  await assert.rejects(open(mid), { code: 'MIGRATION_FAILED' });
  assert.deepEqual(await logOf(mid), kept);
});
