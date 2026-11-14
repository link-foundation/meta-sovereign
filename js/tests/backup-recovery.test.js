import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  makeBackup,
  restoreBackup,
  restoreBackupToDir,
  verifyBackup,
} from '../src/storage/backup.js';
import {
  MAX_DUMP_RECORD_BYTES,
  pruneRecoveryDumps,
  scanRecoveryDump,
} from '../src/storage/recovery-dump.js';
import { encodeLine } from '../src/lino-objects.js';
import {
  parseLinoRecords,
  applyLinoRecords,
} from '../src/storage/lino-store.js';

const directory = async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-recovery-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
};

const backup = async (t, options = {}) => {
  const archiveDir = await directory(t);
  const store = createMemoryStore();
  await store.put({ id: 'note:1', tokens: [], text: 'before' });
  return makeBackup(store, {
    archiveDir,
    recoveryFormats: ['text', 'binary'],
    ...options,
  });
};

test(
  'one backup produces independently restorable text and binary recovery dumps',
  { timeout: 10_000 },
  async (t) => {
    const archiveDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-recovery-'));
    t.after(() => fs.rm(archiveDir, { recursive: true, force: true }));
    const store = createMemoryStore();
    const record = {
      id: 'msg:recovery',
      tokens: ['message'],
      text: 'Hello\n世界',
      amount: 1e18,
      nested: [null, { empty: [] }],
      optional: undefined,
      nonfinite: [NaN, Infinity, -Infinity],
    };
    await store.put(record);
    await store.put({
      id: 'secret:session',
      tokens: [],
      value: 'never in plain dumps',
    });
    const made = await makeBackup(store, {
      archiveDir,
      recoveryFormats: ['text', 'binary'],
      passphrase: 'test archive passphrase',
    });
    assert.equal(made.recovery?.length, 2);
    for (const dump of made.recovery) {
      const restored = createMemoryStore();
      assert.equal(await restoreBackup(restored, dump.file), 1);
      assert.deepEqual(await restored.get(record.id), record);
      assert.equal(await restored.get('secret:session'), null);
      assert.equal(dump.secrets, 'excluded');
      assert.equal(dump.secretsExcluded, 1);
      assert.equal(
        (await fs.readFile(dump.file)).includes('never in plain dumps'),
        false
      );
    }
  }
);

test(
  'truncation, changed bytes and data after the trailer never mutate the target',
  { timeout: 10_000 },
  async (t) => {
    const made = await backup(t);
    for (const dump of made.recovery) {
      const original = await fs.readFile(dump.file);
      const changed = Buffer.from(original);
      changed[Math.floor(changed.length / 2)] ^= 1;
      for (const bytes of [
        original.subarray(0, -1),
        changed,
        Buffer.concat([original, Buffer.from('extra')]),
      ]) {
        await fs.writeFile(dump.file, bytes);
        const target = createMemoryStore();
        const sentinel = { id: 'note:1', tokens: [], text: 'unchanged' };
        await target.put(sentinel);
        await assert.rejects(restoreBackup(target, dump.file));
        assert.deepEqual(await target.query(), [sentinel]);
        assert.equal(await verifyBackup(dump.file), false);
      }
      await fs.writeFile(dump.file, original);
      assert.equal(await verifyBackup(dump.file, { full: true }), true);
    }
  }
);

test(
  'streamed log updates and tombstones replay in order without querying the live store',
  { timeout: 10_000 },
  async (t) => {
    const dir = await directory(t);
    const logFile = path.join(dir, 'data.lino');
    const records = [
      { id: 'note:1', tokens: [], text: 'old' },
      { id: 'note:2', tokens: [], text: 'delete me' },
      { id: 'note:1', tokens: [], text: 'new' },
      { id: 'note:2', '~deleted': true },
      { id: 'secret:old', '~deleted': true },
    ];
    await fs.writeFile(
      logFile,
      records.map((obj) => `${encodeLine({ obj })}\n`).join('')
    );
    const made = await makeBackup(
      {
        logFile,
        query: () => {
          throw new Error('must stream');
        },
      },
      { archiveDir: dir, recoveryFormats: ['text', 'binary'] }
    );
    for (const dump of made.recovery) {
      const target = createMemoryStore();
      await restoreBackup(target, dump.file);
      assert.deepEqual(await target.query(), [records[2]]);
      assert.equal((await scanRecoveryDump(dump.file)).lines, 4);
    }
  }
);

test(
  'binary declared length is bounded before payload allocation',
  { timeout: 5000 },
  async (t) => {
    const dir = await directory(t);
    const file = path.join(dir, 'oversized.lino.bin');
    const header = Buffer.alloc(4);
    header.writeUInt32BE(MAX_DUMP_RECORD_BYTES + 1);
    await fs.writeFile(
      file,
      Buffer.concat([Buffer.from('MSDUMP1B\n'), header])
    );
    await assert.rejects(scanRecoveryDump(file), /4 MiB/);
  }
);

test(
  'a failed dump pair leaves older recovery points intact and no partial new pair',
  { timeout: 10_000 },
  async (t) => {
    const made = await backup(t);
    const archiveDir = path.dirname(made.file);
    const store = createMemoryStore();
    await store.put({
      id: 'too-large',
      tokens: [],
      value: 'x'.repeat(MAX_DUMP_RECORD_BYTES),
    });
    await assert.rejects(
      makeBackup(store, { archiveDir, recoveryFormats: ['text', 'binary'] }),
      /4 MiB/
    );
    const files = await fs.readdir(archiveDir);
    assert.deepEqual(
      files.filter((file) => file.startsWith('recovery-')).sort(),
      made.recovery.map((dump) => path.basename(dump.file)).sort()
    );
    assert.equal(
      files.some((file) => file.endsWith('.tmp')),
      false
    );
  }
);

test(
  'retention keeps N of each format and preserves older files if the newest is broken',
  { timeout: 10_000 },
  async (t) => {
    const dir = await directory(t);
    const store = createMemoryStore();
    await store.put({ id: 'note:1', tokens: [] });
    const made = [];
    for (let day = 1; day <= 3; day += 1) {
      made.push(
        await makeBackup(store, {
          archiveDir: dir,
          now: new Date(`2026-11-0${day}T00:00:00Z`),
          recoveryFormats: ['text', 'binary'],
        })
      );
    }
    const newest = made[2].recovery[0].file;
    const original = await fs.readFile(newest);
    await fs.writeFile(newest, original.subarray(0, -1));
    const pruned = await pruneRecoveryDumps({ archiveDir: dir, keep: 1 });
    assert.equal(
      pruned.length,
      2,
      'binary pruned, corrupt text point preserved'
    );
    assert.ok(pruned.every((file) => file.endsWith('.bin')));
    await fs.writeFile(newest, original);
    assert.equal(
      (await pruneRecoveryDumps({ archiveDir: dir, keep: 1 })).length,
      2
    );
    assert.equal(
      (await fs.readdir(dir)).filter((file) => file.startsWith('recovery-'))
        .length,
      2
    );
  }
);

test(
  'both dump formats atomically replace a closed folder and carry its existing secrets',
  { timeout: 10_000 },
  async (t) => {
    const made = await backup(t);
    for (const dump of made.recovery) {
      const dir = await directory(t);
      const log = path.join(dir, 'data.lino');
      const secret = {
        id: 'secret:local',
        tokens: [],
        value: 'keep local credential',
      };
      await fs.writeFile(log, `${encodeLine({ obj: secret })}\n`);
      await assert.rejects(restoreBackupToDir(dump.file, dir), {
        code: 'BACKUP_TARGET_NOT_EMPTY',
      });
      await restoreBackupToDir(dump.file, dir, { replace: true });
      const records = applyLinoRecords(
        parseLinoRecords(await fs.readFile(log, 'utf8'))
      );
      assert.deepEqual(
        records.find((r) => r.id === secret.id),
        secret
      );
      assert.equal(records.find((r) => r.id === 'note:1').text, 'before');
      assert.ok(
        (await fs.readdir(dir)).some((file) =>
          file.startsWith('data.lino.before-restore-')
        )
      );
    }
  }
);
