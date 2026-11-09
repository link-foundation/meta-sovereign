import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { RECOVERY_SETTINGS_ID } from '../src/storage/recovery-settings.js';
import { acquireStoreLock } from '../src/storage/store-lock.js';
import { runCli } from '../src/cli/index.js';
import {
  encodeWire,
  readWireResponse,
  LINO_BINARY,
} from '../src/transport/lino.js';
import {
  parseLinoRecords,
  applyLinoRecords,
} from '../src/storage/lino-store.js';

const temporary = async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-recovery-controls-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
};
const fixture = async (t, options = {}) => {
  const store = options.store ?? createMemoryStore();
  const server = await startServer({
    store,
    archiveDir: await temporary(t),
    port: 0,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    automations: { scheduler: false },
    ...options,
  });
  t.after(() => server.close());
  const call = async (route, body) => {
    const response = await fetch(
      `http://127.0.0.1:${server.port}/api/backups${route}`,
      {
        headers: {
          accept: LINO_BINARY,
          ...(body !== undefined ? { 'content-type': LINO_BINARY } : {}),
        },
        ...(body !== undefined
          ? { method: 'POST', body: encodeWire(body, LINO_BINARY) }
          : {}),
      }
    );
    return { status: response.status, data: await readWireResponse(response) };
  };
  return { store, server, call };
};

test(
  'Lino API defaults to both dumps, persists settings, lists formats and restores each dump',
  { timeout: 15_000 },
  async (t) => {
    const { store, call } = await fixture(t);
    const before = await call('/settings');
    assert.deepEqual(before.data, {
      available: true,
      intervalHours: 24,
      keep: 3,
      formats: ['text', 'binary'],
    });
    const settings = { intervalHours: 0, keep: 2, formats: ['text', 'binary'] };
    assert.equal((await call('/settings', settings)).data.ok, true);
    assert.equal((await store.get(RECOVERY_SETTINGS_ID)).keep, 2);
    await store.put({ id: 'note:1', tokens: [], body: 'recover me' });
    const created = await call('', {});
    assert.equal(created.status, 200);
    assert.equal(created.data.recovery.length, 2);
    assert.ok(
      created.data.recovery.every((dump) => !dump.file.includes(path.sep))
    );
    const listed = (await call('')).data;
    assert.deepEqual(listed.map((file) => file.format).sort(), [
      'archive',
      'binary',
      'text',
    ]);
    for (const dump of created.data.recovery) {
      await store.put({ id: 'note:1', tokens: [], body: 'changed' });
      assert.equal((await call('/restore', { file: dump.file })).status, 200);
      assert.equal((await store.get('note:1')).body, 'recover me');
    }
    for (const bad of [
      { ...settings, intervalHours: -1 },
      { ...settings, intervalHours: 1000 },
      { ...settings, keep: 1.5 },
      { ...settings, formats: ['json'] },
    ]) {
      assert.equal((await call('/settings', bad)).status, 400);
    }
    assert.deepEqual((await call('/settings')).data.formats, [
      'text',
      'binary',
    ]);
  }
);

test(
  'live schedule changes run both dumps, stop cleanly and survive server restart',
  { timeout: 15_000 },
  async (t) => {
    const store = createMemoryStore();
    const archiveDir = await temporary(t);
    let done;
    const completed = new Promise((resolve) => {
      done = resolve;
    });
    const first = await fixture(t, {
      store,
      archiveDir,
      backups: { intervalHours: 0 },
      log: (event) => {
        if (event.event === 'backup_done') {
          done();
        }
      },
    });
    assert.equal(
      (
        await first.call('/settings', {
          intervalHours: 0.00002,
          keep: 1,
          formats: ['text', 'binary'],
        })
      ).status,
      200
    );
    await completed;
    await first.call('/settings', {
      intervalHours: 0,
      keep: 1,
      formats: ['binary'],
    });
    const files = await fs.readdir(archiveDir);
    assert.equal(
      files.filter((file) => file.startsWith('recovery-')).length,
      2
    );
    await first.server.close();
    const second = await fixture(t, { store, archiveDir });
    assert.deepEqual((await second.call('/settings')).data, {
      available: true,
      intervalHours: 0,
      keep: 1,
      formats: ['binary'],
    });
    assert.deepEqual(await fs.readdir(archiveDir), files);
  }
);

test(
  'CLI config, backup and folder restore share recovery formats',
  { timeout: 20_000 },
  async (t) => {
    const dir = await temporary(t);
    const store = path.join(dir, 'source');
    const archiveDir = path.join(dir, 'archives');
    const output = [];
    const call = (args) => runCli(args, { log: (line) => output.push(line) });
    assert.equal(
      await call([
        'backup-config',
        `--store=${store}`,
        '--interval-hours=0',
        '--keep=2',
        '--formats=text,binary',
      ]),
      0
    );
    assert.equal(
      await call(['backup', `--store=${store}`, `--archive=${archiveDir}`]),
      0
    );
    const files = await fs.readdir(archiveDir);
    const dumps = files.filter((file) => file.startsWith('recovery-'));
    assert.equal(dumps.length, 2);
    for (const [index, file] of dumps.entries()) {
      const target = path.join(dir, `target-${index}`);
      assert.equal(
        await call([
          'restore',
          `--store=${target}`,
          `--file=${path.join(archiveDir, file)}`,
          '--replace=true',
        ]),
        0
      );
      // A completed CLI restore releases its writer, allowing the next command.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        assert.equal(
          await call([
            'restore',
            `--store=${target}`,
            `--file=${path.join(archiveDir, file)}`,
          ]),
          0
        );
        const lock = await acquireStoreLock(target, { exclusive: true });
        lock.release();
      }
      const records = applyLinoRecords(
        parseLinoRecords(
          await fs.readFile(path.join(target, 'data.lino'), 'utf8')
        )
      );
      assert.ok(
        records.some(
          (record) =>
            record.id === RECOVERY_SETTINGS_ID && record.intervalHours === 0
        )
      );
    }
    assert.ok(
      output.some((line) => line.includes('binary recovery dump written'))
    );
  }
);
