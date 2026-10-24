// R-Z7: the automatic backup (R-A4) really runs once the server is up.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startServer } from '../src/server/index.js';
import { backupSettings } from '../src/server/backup-job.js';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const HOUR = 3_600_000;

const run = async (extra, wait = 400) => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-z7-bk-'));
  const events = [];
  const server = await startServer({
    port: 0,
    storeDir,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    automations: { scheduler: false },
    log: (event) => events.push(event),
    ...extra,
  });
  await server.store.put({ id: 'note:1', tokens: ['hello'] });
  await server.store.put({ id: 'secret:token', tokens: ['hunter2'] });
  await pause(wait);
  await server.close();
  const dir = path.join(storeDir, 'archives');
  const files = (await fs.readdir(dir)).filter((f) =>
    f.startsWith('meta-sovereign-')
  );
  return { files, events, dir };
};

test('settings: daily and keep 3 by default, 0 hours switches it off', () => {
  assert.deepEqual(backupSettings({}, {}), {
    intervalMs: 24 * HOUR,
    keep: 3,
    invalid: [],
  });
  assert.equal(
    backupSettings({}, { MS_BACKUP_INTERVAL_HOURS: '6' }).intervalMs,
    6 * HOUR
  );
  assert.equal(
    backupSettings({}, { MS_BACKUP_INTERVAL_HOURS: '0' }).intervalMs,
    0
  );
  assert.equal(backupSettings({}, { MS_BACKUP_KEEP: '0' }).keep, 0);
  assert.equal(backupSettings({ intervalHours: 0 }, {}).intervalMs, 0);
  assert.equal(
    backupSettings({}, { MS_BACKUP_INTERVAL_HOURS: '6', MS_BACKUP_KEEP: '5' })
      .keep,
    5
  );
  // Nonsense falls back to the defaults and is reported.
  const bad = backupSettings(
    {},
    { MS_BACKUP_INTERVAL_HOURS: 'x', MS_BACKUP_KEEP: '-2' }
  );
  assert.equal(bad.intervalMs, 24 * HOUR);
  assert.equal(bad.keep, 3);
  assert.deepEqual(bad.invalid, ['MS_BACKUP_INTERVAL_HOURS', 'MS_BACKUP_KEEP']);
});

test('an invalid setting logs once and the server still starts', async () => {
  const saved = process.env.MS_BACKUP_INTERVAL_HOURS;
  process.env.MS_BACKUP_INTERVAL_HOURS = 'soon';
  try {
    const { events, files } = await run({ backups: undefined }, 100);
    assert.equal(
      events.filter((e) => e.event === 'backup_setting_ignored').length,
      1
    );
    assert.equal(files.length, 0);
  } finally {
    if (saved === undefined) {
      delete process.env.MS_BACKUP_INTERVAL_HOURS;
    } else {
      process.env.MS_BACKUP_INTERVAL_HOURS = saved;
    }
  }
});

test('by default a daily backup is scheduled, not run at start', async () => {
  const { files } = await run({}, 150);
  assert.equal(files.length, 0, 'the first run is one interval after start');
});

test('a started server writes a backup on its interval', async () => {
  const { files } = await run({ backups: { intervalHours: 0.00002 } });
  assert.ok(files.length >= 1, 'no backup was written');
  assert.ok(files.every((f) => !f.endsWith('.enc')));
});

test('the passphrase encrypts the automatic backup', async () => {
  const { files } = await run({
    backups: { intervalHours: 0.00002 },
    secretPassphrase: 'correct horse',
  });
  assert.ok(files.length >= 1);
  assert.ok(files.every((f) => f.endsWith('.enc')));
});

test('keep trims old archives', async () => {
  const { files } = await run(
    { backups: { intervalHours: 0.000005, keep: 2 } },
    900
  );
  assert.ok(files.length <= 2, `${files.length} archives kept`);
});

test('a nearly full disk skips the run and logs it', async () => {
  const { files, events } = await run({
    backups: { intervalHours: 0.00002 },
    diskFree: () => 10,
  });
  assert.equal(files.length, 0);
  assert.ok(events.some((e) => e.event === 'backup_skipped'));
});

test('0 hours means no automatic backup', async () => {
  const { files } = await run({ backups: { intervalHours: 0 } });
  assert.equal(files.length, 0);
});

test('an automatic backup is private and leaves no temp file behind', async () => {
  const { files, dir } = await run({ backups: { intervalHours: 0.00002 } });
  assert.ok(files.length >= 1);
  assert.deepEqual(
    (await fs.readdir(dir)).filter((f) => f.includes('.tmp')),
    []
  );
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(dir)).mode & 0o077, 0);
    assert.equal((await fs.stat(path.join(dir, files[0]))).mode & 0o077, 0);
  }
});
