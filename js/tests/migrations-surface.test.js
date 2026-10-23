// Where a person meets the schema (R-Z17): /api/health, the server's start,
// the CLI `migrate`, backups and restores.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { startServer } from '../src/server/index.js';
import { runCli } from '../src/cli/index.js';
import { openDualStore } from '../src/storage/dual-store.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  CURRENT_SCHEMA,
  SCHEMA_ID,
  schemaLink,
} from '../src/storage/migrations/index.js';
import {
  createBackup,
  linksOfManifest,
  restoreBackup,
} from '../src/storage/backup.js';
import { JOURNAL } from '../src/storage/migrations/node-runner.js';
import { tmpdir, writeOldStore, oldLinks } from './helpers/test-migrations.mjs';

const oldEmail = {
  id: 'msg:email:m1',
  tokens: ['message', 'email', 'm1'],
  source: 'email',
  protocol: 'rfc822',
  subject: 'Hi',
  chat: 'Hi',
  timestamp: 'Tue, 02 Jan 2024 10:00:00 +0000',
  rawHeaders: { 'message-id': ['<m1@x>'] },
  children: ['chat:email:Hi'],
};

test('/api/health reports the schema version and the current one', async () => {
  const dir = await writeOldStore(await tmpdir(), [oldEmail]);
  const logs = [];
  const server = await startServer({
    port: 0,
    storeDir: dir,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    log: (e) => logs.push(e),
  });
  try {
    const health = await (
      await fetch(`http://127.0.0.1:${server.port}/api/health`)
    ).json();
    assert.deepEqual(health.schema, {
      version: CURRENT_SCHEMA,
      current: CURRENT_SCHEMA,
    });
    // The real migration ran before the server listened.
    assert.ok(logs.some((e) => e.event === 'migration_done'));
    const mail = await (
      await fetch(`http://127.0.0.1:${server.port}/links/msg:email:m1`)
    ).json();
    assert.equal(mail.chat, 'm1@x');
    // The marker is the app's own: the HTTP API refuses to write it.
    const put = await fetch(`http://127.0.0.1:${server.port}/links`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: SCHEMA_ID, tokens: ['x'], version: 0 }),
    });
    assert.equal(put.status, 400);
  } finally {
    await server.close();
  }
});

test('the server does not start on a store from a newer version', async () => {
  const dir = await writeOldStore(await tmpdir(), [
    ...oldLinks(2),
    schemaLink({ version: CURRENT_SCHEMA + 1 }),
  ]);
  const logs = [];
  await assert.rejects(
    startServer({
      port: 0,
      storeDir: dir,
      enableSync: false,
      enableHandlers: false,
      telegramAccount: false,
      log: (e) => logs.push(e),
    }),
    { code: 'STORE_TOO_NEW' }
  );
  assert.ok(logs.some((e) => e.event === 'schema_too_new'));
});

test('CLI: migrate --status, --dry-run (writes nothing) and migrate', async () => {
  const dir = await writeOldStore(await tmpdir(), [oldEmail, ...oldLinks(3)]);
  const before = await fs.readFile(path.join(dir, 'data.lino'));
  const out = [];
  const log = (line) => out.push(line);

  assert.equal(
    await runCli(['migrate', `--store=${dir}`, '--status'], { log }),
    0
  );
  assert.match(out.at(-1), /schema version 0 .*2 migration\(s\) pending/);

  out.length = 0;
  assert.equal(
    await runCli(['migrate', `--store=${dir}`, '--dry-run'], { log }),
    0
  );
  assert.match(
    out.join('\n'),
    /would run 0001-email-threads: scanned 4, changed 1/
  );
  assert.match(out.at(-1), /1 links would change .*nothing was written/);
  assert.deepEqual(
    await fs.readdir(dir),
    ['data.lino'],
    'no lock, journal or snapshot'
  );
  assert.deepEqual(await fs.readFile(path.join(dir, 'data.lino')), before);

  out.length = 0;
  assert.equal(await runCli(['migrate', `--store=${dir}`], { log }), 0);
  assert.match(
    out.join('\n'),
    /migration 0001-email-threads: scanned 4, changed 1/
  );
  assert.equal(await fs.stat(path.join(dir, JOURNAL)).catch(() => null), null);

  out.length = 0;
  await runCli(['migrate', `--store=${dir}`, '--status'], { log });
  assert.match(out[0], /schema version 2 .*up to date/);
  assert.match(out.join('\n'), /applied 0001-email-threads/);
  out.length = 0;
  await runCli(['migrate', `--store=${dir}`], { log });
  assert.match(out[0], /nothing to migrate/);
});

test('CLI: a store from a newer version ends the command with the message, code 1', async () => {
  const dir = await writeOldStore(await tmpdir(), [
    ...oldLinks(1),
    schemaLink({ version: CURRENT_SCHEMA + 3 }),
  ]);
  const out = [];
  const code = await runCli(['migrate', `--store=${dir}`, '--status'], {
    log: (line) => out.push(line),
  });
  assert.equal(code, 1);
  assert.match(out[0], /written by a newer version.*update the app/);
});

test('a backup records the schema; restoring an older one migrates it, a newer one is refused', async () => {
  const archiveDir = await tmpdir();
  // A store at the current schema.
  const store = createMemoryStore();
  await store.putMany([
    { id: 'a', tokens: ['x'] },
    schemaLink({ version: CURRENT_SCHEMA }),
  ]);
  const file = await createBackup(store, { archiveDir });
  const manifest = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.deepEqual(manifest.schema, { version: CURRENT_SCHEMA });

  // An old archive (no `schema`: version 0) with an old-shape mail.
  const oldFile = path.join(archiveDir, 'meta-sovereign-old.json');
  await fs.writeFile(
    oldFile,
    JSON.stringify({ version: 1, links: [oldEmail, { id: 'b', tokens: [] }] })
  );
  const target = createMemoryStore();
  assert.equal(await restoreBackup(target, oldFile), 2);
  assert.equal((await target.get('msg:email:m1')).chat, 'm1@x');
  assert.equal(
    await target.get(SCHEMA_ID),
    null,
    'the archive`s marker is not restored'
  );

  // A newer one.
  const newFile = path.join(archiveDir, 'meta-sovereign-new.json');
  await fs.writeFile(
    newFile,
    JSON.stringify({
      version: 1,
      schema: { version: CURRENT_SCHEMA + 1 },
      links: [{ id: 'c', tokens: [] }],
    })
  );
  const untouched = createMemoryStore();
  await assert.rejects(restoreBackup(untouched, newFile), {
    code: 'BACKUP_TOO_NEW',
  });
  assert.deepEqual(await untouched.query(), []);
});

test('a restore into a real store ends in the current shapes; a failing migration stops it before any write', async () => {
  const dir = await tmpdir();
  const store = await openDualStore(dir);
  const oldFile = path.join(dir, 'meta-sovereign-old.json');
  await fs.writeFile(
    oldFile,
    JSON.stringify({ version: 1, links: [oldEmail] })
  );
  await restoreBackup(store, oldFile);
  assert.equal((await store.get('msg:email:m1')).chat, 'm1@x');
  store.close();
  const failing = {
    id: '0001-fails',
    from: 0,
    to: 1,
    description: 'always fails (test)',
    async up() {
      throw new Error('nope');
    },
  };
  await assert.rejects(
    linksOfManifest(
      { links: [oldEmail] },
      { migrations: [failing], current: 1 }
    ),
    { code: 'MIGRATION_FAILED', migration: '0001-fails' }
  );
});
