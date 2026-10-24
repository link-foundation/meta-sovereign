// R-Z16 + R-Z17: format 2 backups carry the data schema; a newer one is
// refused, an older one restores and migrates when the store next opens.
// Also: no whole-file read while streaming. Temp folders only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWriteStream, promises as fs } from 'node:fs';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { encodeLine } from 'lino-objects-codec';

import { openDualStore } from '../src/storage/dual-store.js';
import { createMemoryStore } from '../src/storage/index.js';
import { makeBackup, restoreBackup } from '../src/storage/backup.js';
import { scanArchive } from '../src/storage/backup-archive.js';
import {
  CURRENT_SCHEMA,
  SCHEMA_ID,
  schemaLink,
} from '../src/storage/migrations/index.js';

const tmp = (name) => fs.mkdtemp(path.join(os.tmpdir(), `ms-z16s-${name}-`));
const old = { id: 'msg:old:1', tokens: ['msg'], deleted: true, text: 'gone' };

// A store whose data and stamp are in the shapes of schema `CURRENT - 1`.
const olderStore = async (dir) => {
  const store = await openDualStore(dir);
  await store.put(old);
  await store.put({ id: 'secret:telegram:session', tokens: [], value: 'S3' });
  await store.put(schemaLink({ version: CURRENT_SCHEMA - 1 }));
  return store;
};

test('the manifest carries the schema the backup was written in', async () => {
  const dir = await tmp('manifest');
  const store = await openDualStore(path.join(dir, 's'));
  await store.put({ id: 'note:1', tokens: ['a'] });
  await store.put(schemaLink({ version: CURRENT_SCHEMA }));
  const made = await makeBackup(store, { archiveDir: path.join(dir, 'a') });
  const { manifest } = await scanArchive(made.file, {});
  assert.deepEqual(manifest.schema, { version: CURRENT_SCHEMA });
  store.close();
});

test('a newer-schema backup is refused with BACKUP_TOO_NEW and nothing is written', async () => {
  const dir = await tmp('new');
  const store = await openDualStore(path.join(dir, 's'));
  await store.put(schemaLink({ version: CURRENT_SCHEMA + 1 }));
  const made = await makeBackup(store, { archiveDir: path.join(dir, 'a') });
  store.close();
  const target = createMemoryStore();
  await assert.rejects(restoreBackup(target, made.file), {
    code: 'BACKUP_TOO_NEW',
  });
  assert.deepEqual(await target.query(), []);
});

test('an older-schema backup restores and the store migrates on next open', async () => {
  const dir = await tmp('older');
  const source = await olderStore(path.join(dir, 'src'));
  const made = await makeBackup(source, { archiveDir: path.join(dir, 'a') });
  source.close();
  const { manifest } = await scanArchive(made.file, {});
  assert.equal(manifest.schema.version, CURRENT_SCHEMA - 1);

  // Into an open store (already current): the stamp goes back, the records
  // come in as they were, the next open migrates them.
  const live = path.join(dir, 'live');
  const target = await openDualStore(live);
  await target.put({ id: 'note:1', tokens: ['a'] });
  await target.put(schemaLink({ version: CURRENT_SCHEMA }));
  await restoreBackup(target, made.file);
  assert.equal((await target.get('msg:old:1')).deleted, true);
  assert.equal((await target.get(SCHEMA_ID)).version, CURRENT_SCHEMA - 1);
  target.close();
  const reopened = await openDualStore(live);
  assert.equal((await reopened.get('msg:old:1')).deleted.by, 'unknown');
  assert.equal((await reopened.get(SCHEMA_ID)).version, CURRENT_SCHEMA);
  reopened.close();
});

test('restoring into a folder keeps the old stamp so the open migrates', async () => {
  const { restoreBackupToDir } = await import('../src/storage/backup.js');
  const dir = await tmp('dir');
  const source = await olderStore(path.join(dir, 'src'));
  const made = await makeBackup(source, { archiveDir: path.join(dir, 'a') });
  source.close();
  const dest = path.join(dir, 'dest');
  await restoreBackupToDir(made.file, dest);
  const store = await openDualStore(dest);
  assert.equal((await store.get('msg:old:1')).deleted.by, 'unknown');
  assert.equal((await store.get(SCHEMA_ID)).version, CURRENT_SCHEMA);
  store.close();
});

test('an old-format backup still restores, and a plain one has no secrets', async () => {
  const dir = await tmp('fmt1');
  const file = path.join(dir, 'meta-sovereign-1.json');
  await fs.writeFile(file, JSON.stringify({ version: 1, links: [old] }));
  const target = createMemoryStore();
  assert.equal(await restoreBackup(target, file), 1);
  assert.equal((await target.get('msg:old:1')).deleted.by, 'unknown');

  const source = await olderStore(path.join(dir, 'src'));
  const made = await makeBackup(source, { archiveDir: path.join(dir, 'a') });
  source.close();
  assert.equal(made.secretsExcluded, 1);
  const back = createMemoryStore();
  await restoreBackup(back, made.file);
  assert.equal(await back.get('secret:telegram:session'), null);
});

test('backup and restore stream: the log is never read whole', async () => {
  const dir = await tmp('stream');
  const log = path.join(dir, 'data.lino');
  const out = createWriteStream(log);
  for (let i = 0; i < 20_000; i += 1) {
    const line = encodeLine({
      obj: { id: `msg:s:${i}`, tokens: ['m'], body: 'x'.repeat(120) },
    });
    if (!out.write(`${line}\n`)) {
      await once(out, 'drain');
    }
  }
  out.end();
  await once(out, 'finish');
  const size = (await fs.stat(log)).size;
  assert.ok(size > 2 * 1024 * 1024, 'the log is much larger than one chunk');

  const read = fs.readFile;
  const whole = [];
  fs.readFile = (file, ...rest) => {
    whole.push(String(file));
    return read.call(fs, file, ...rest);
  };
  try {
    const made = await makeBackup(
      { logFile: log, query: async () => [] },
      { archiveDir: path.join(dir, 'a') }
    );
    assert.equal(made.links, 20_000);
    const target = createMemoryStore();
    assert.equal(await restoreBackup(target, made.file), 20_000);
  } finally {
    fs.readFile = read;
  }
  assert.deepEqual(
    whole.filter((f) => f.endsWith('.lino') || f.endsWith('.msbk')),
    []
  );
});
