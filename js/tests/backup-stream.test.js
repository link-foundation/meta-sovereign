// R-Z16: backups and restores that work on a multi-gigabyte store: streamed
// archives, bounded memory, authenticated frames, restore checked before it
// writes. Temp folders and fakes only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWriteStream, promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import os from 'node:os';
import v8 from 'node:v8';
import vm from 'node:vm';
import path from 'node:path';
import { encodeLine } from 'lino-objects-codec';

import { assertMode } from './helpers/mode.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { openDualStore } from '../src/storage/dual-store.js';
import { createMemoryStore } from '../src/storage/index.js';
import {
  encryptBackup,
  makeBackup,
  pruneBackups,
  restoreBackup,
  restoreBackupToDir,
  verifyBackup,
} from '../src/storage/backup.js';

const tmp = (name) => fs.mkdtemp(path.join(os.tmpdir(), `ms-z16-${name}-`));
const link = (i, extra = {}) => ({
  id: `msg:z:${i}`,
  tokens: ['msg', 'z', `${i}`],
  body: `body ${i}`,
  ...extra,
});

// Write `count` link records straight into a log file, never holding them.
const writeLog = async (file, count, make = link) => {
  const out = createWriteStream(file);
  for (let i = 0; i < count; i += 1) {
    if (!out.write(`${encodeLine({ obj: make(i) })}\n`)) {
      await once(out, 'drain');
    }
  }
  out.end();
  await once(out, 'finish');
};

// What a backup needs of a store that has a log file.
const logStore = (logFile) => ({ logFile, query: async () => [] });

const countLinks = async (store) => (await store.query()).length;

test('a plain backup round-trips, leaves secrets out and counts them', async () => {
  const dir = await tmp('plain');
  const log = path.join(dir, 'data.lino');
  await writeLog(log, 50, (i) =>
    i % 10 === 0
      ? { id: `secret:s:${i}`, tokens: [], value: 'S3CR3T' }
      : link(i)
  );
  const made = await makeBackup(logStore(log), {
    archiveDir: path.join(dir, 'a'),
  });
  assert.equal(made.secrets, 'excluded');
  assert.equal(made.secretsExcluded, 5);
  assert.equal(made.links, 45);
  await assertMode(made.file, 0o600);
  assert.ok(made.file.endsWith('.msbk'));
  assert.ok(!(await fs.readFile(made.file)).includes('S3CR3T'));
  assert.equal(await verifyBackup(made.file), true);
  assert.equal(await verifyBackup(made.file, { full: true }), true);

  const target = createMemoryStore();
  assert.equal(await restoreBackup(target, made.file), 45);
  assert.equal(await countLinks(target), 45);
  assert.equal((await target.get('msg:z:7')).body, 'body 7');
  assert.equal(await target.get('secret:s:0'), null);
});

test('an encrypted backup keeps secrets sealed and round-trips', async () => {
  const dir = await tmp('enc');
  const log = path.join(dir, 'data.lino');
  await writeLog(log, 20, (i) =>
    i === 3 ? { id: 'secret:t', tokens: [], value: 'S3CR3T' } : link(i)
  );
  const made = await makeBackup(logStore(log), {
    archiveDir: path.join(dir, 'a'),
    passphrase: 'correct horse',
  });
  assert.ok(made.file.endsWith('.msbk.enc'));
  assert.equal(made.secrets, 'included-encrypted');
  const bytes = await fs.readFile(made.file);
  assert.ok(!bytes.includes('S3CR3T') && !bytes.includes('body 4'));
  // The cheap check needs no passphrase; the full one does.
  assert.equal(await verifyBackup(made.file), true);
  assert.equal(await verifyBackup(made.file, { full: true }), false);
  assert.equal(
    await verifyBackup(made.file, { full: true, passphrase: 'correct horse' }),
    true
  );
  const target = createMemoryStore();
  await assert.rejects(restoreBackup(target, made.file), {
    code: 'BACKUP_PASSPHRASE_REQUIRED',
  });
  await assert.rejects(
    restoreBackup(target, made.file, { passphrase: 'wrong' }),
    { code: 'BACKUP_BAD_PASSPHRASE' }
  );
  assert.equal(await countLinks(target), 0);
  await restoreBackup(target, made.file, { passphrase: 'correct horse' });
  assert.equal((await target.get('secret:t')).value, 'S3CR3T');
  assert.equal(await countLinks(target), 20);
});

// Frame boundaries of an archive file: [{ at, end }].
const framesOf = (bytes) => {
  const frames = [];
  let at = 28;
  while (at < bytes.length) {
    const end = at + 5 + bytes.readUInt32BE(at + 1) + 16;
    frames.push({ at, end });
    at = end;
  }
  return frames;
};

const bigArchive = async (passphrase) => {
  const dir = await tmp(passphrase ? 'tamper-enc' : 'tamper');
  const log = path.join(dir, 'data.lino');
  // Random text does not compress: several 1 MB frames.
  await writeLog(log, 3000, (i) =>
    link(i, { body: randomBytes(1000).toString('hex') })
  );
  const made = await makeBackup(logStore(log), {
    archiveDir: path.join(dir, 'a'),
    passphrase,
  });
  return { dir, ...made, bytes: await fs.readFile(made.file) };
};

for (const passphrase of [null, 'pw']) {
  test(`tampering is detected before restore changes anything (${passphrase ? 'encrypted' : 'plain'})`, async () => {
    const { dir, file, bytes } = await bigArchive(passphrase);
    const frames = framesOf(bytes);
    assert.ok(frames.length >= 3, `frames: ${frames.length}`);
    const variants = {
      flipped: (b) => {
        const c = Buffer.from(b);
        c[frames[1].at + 100] ^= 0xff;
        return c;
      },
      flippedFlag: (b) => {
        const c = Buffer.from(b);
        c[frames.at(-2).at] ^= 1;
        return c;
      },
      truncatedMid: (b) => b.subarray(0, frames[1].at + 50),
      truncatedFrames: (b) => b.subarray(0, frames.at(-1).at),
      reordered: (b) =>
        Buffer.concat([
          b.subarray(0, 28),
          b.subarray(frames[1].at, frames[1].end),
          b.subarray(frames[0].at, frames[0].end),
          b.subarray(frames[2].at),
        ]),
      trailingBytes: (b) => Buffer.concat([b, Buffer.from('x')]),
    };
    for (const [name, make] of Object.entries(variants)) {
      const bad = path.join(dir, `meta-sovereign-bad-${name}.msbk`);
      await fs.writeFile(bad, make(bytes));
      const target = createMemoryStore();
      await assert.rejects(
        restoreBackup(target, bad, { passphrase }),
        (error) => /^BACKUP_/.test(error.code),
        name
      );
      assert.equal(await countLinks(target), 0, `${name} wrote nothing`);
      assert.equal(await verifyBackup(bad, { passphrase, full: true }), false);
    }
    // The cheap check sees a file cut short, without the passphrase.
    const cut = path.join(dir, 'meta-sovereign-cut.msbk');
    await fs.writeFile(cut, variants.truncatedFrames(bytes));
    assert.equal(await verifyBackup(cut), false);
    assert.equal(await verifyBackup(file, { passphrase, full: true }), true);
  });
}

test('an archive of the earlier format still restores', async () => {
  const dir = await tmp('old');
  const links = [link(1), link(2)];
  const plain = path.join(dir, 'meta-sovereign-old.json');
  await fs.writeFile(plain, JSON.stringify({ version: 1, links }));
  const enc = path.join(dir, 'meta-sovereign-old2.json.enc');
  await fs.writeFile(
    enc,
    encryptBackup(JSON.stringify({ version: 1, links }), 'pp')
  );
  const a = createMemoryStore();
  assert.equal(await restoreBackup(a, plain), 2);
  const b = createMemoryStore();
  assert.equal(await restoreBackup(b, enc, { passphrase: 'pp' }), 2);
  assert.equal((await b.get('msg:z:2')).body, 'body 2');
  assert.equal(await verifyBackup(plain), true);
  assert.equal(await verifyBackup(enc), true);
});

test('writes during a backup cannot tear it', async () => {
  const dir = await tmp('live');
  const text = await createLinoTextStore(path.join(dir, 'data.lino'), {
    syncMs: 5,
  });
  const first = [];
  for (let i = 0; i < 2000; i += 1) {
    first.push(link(i, { body: randomBytes(300).toString('hex') }));
  }
  await text.putMany(first);
  await text.flush();
  const store = {
    logFile: text.filePath,
    flushLog: () => text.flush(),
    query: () => text.query(),
  };
  let writing = true;
  const writer = (async () => {
    for (let i = 10_000; writing; i += 1) {
      await text.put(link(i));
      if (i % 50 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  })();
  const made = await makeBackup(store, { archiveDir: path.join(dir, 'a') });
  writing = false;
  await writer;
  assert.ok(made.links >= 2000, `links ${made.links}`);
  assert.equal(await verifyBackup(made.file, { full: true }), true);
  const target = createMemoryStore();
  await restoreBackup(target, made.file);
  assert.equal((await target.get('msg:z:1999')).body.length, 600);
  assert.ok((await countLinks(target)) >= 2000);
});

test('a log that ends in a torn line is cut back to its last whole line', async () => {
  const dir = await tmp('torn');
  const log = path.join(dir, 'data.lino');
  await writeLog(log, 5);
  await fs.appendFile(log, '(o: (id "msg:z:torn") (tokens ("m'); // no newline
  const made = await makeBackup(logStore(log), {
    archiveDir: path.join(dir, 'a'),
  });
  assert.equal(made.links, 5);
  const target = createMemoryStore();
  assert.equal(await restoreBackup(target, made.file), 5);
});

test('tombstones replay and a stores without a log file is queried', async () => {
  const dir = await tmp('tomb');
  const log = path.join(dir, 'data.lino');
  await writeLog(log, 3);
  await fs.appendFile(
    log,
    `${encodeLine({ obj: { id: 'msg:z:1', '~deleted': true } })}\n`
  );
  const made = await makeBackup(logStore(log), {
    archiveDir: path.join(dir, 'a'),
  });
  const target = createMemoryStore();
  await target.put(link(1));
  await restoreBackup(target, made.file);
  assert.equal(await target.get('msg:z:1'), null);
  assert.ok(await target.get('msg:z:2'));

  const mem = createMemoryStore();
  await mem.put(link(9));
  const viaQuery = await makeBackup(mem, { archiveDir: path.join(dir, 'b') });
  const again = createMemoryStore();
  assert.equal(await restoreBackup(again, viaQuery.file), 1);
});

test('a nearly full disk skips the backup and writes nothing', async () => {
  const dir = await tmp('low');
  const log = path.join(dir, 'data.lino');
  await writeLog(log, 10);
  const events = [];
  const made = await makeBackup(logStore(log), {
    archiveDir: path.join(dir, 'a'),
    measureFree: async () => 1000,
    onEvent: (e) => events.push(e),
  });
  assert.equal(made.skipped, true);
  assert.equal(made.reason, 'low_disk');
  assert.equal(events[0].event, 'backup_skipped');
  assert.deepEqual(await fs.readdir(path.join(dir, 'a')), []);
});

test('a failed write leaves no archive and no temp file', async () => {
  const dir = await tmp('fail');
  const archiveDir = path.join(dir, 'a');
  const broken = {
    logFile: path.join(dir, 'data.lino'),
    flushLog: async () => {
      throw new Error('disk gone');
    },
  };
  await assert.rejects(makeBackup(broken, { archiveDir }), /disk gone/);
  assert.deepEqual(await fs.readdir(archiveDir), []);
});

test('pruning never deletes unless the newest archive is whole', async () => {
  const dir = await tmp('prune');
  const log = path.join(dir, 'data.lino');
  await writeLog(log, 5);
  const archiveDir = path.join(dir, 'a');
  for (let i = 0; i < 3; i += 1) {
    await makeBackup(logStore(log), {
      archiveDir,
      now: new Date(Date.now() + i * 1000),
    });
  }
  const names = (await fs.readdir(archiveDir)).sort();
  const newest = path.join(archiveDir, names.at(-1));
  const bytes = await fs.readFile(newest);
  await fs.writeFile(newest, bytes.subarray(0, bytes.length - 10));
  assert.deepEqual(await pruneBackups({ archiveDir, keep: 1 }), []);
  assert.equal((await fs.readdir(archiveDir)).length, 3);
  await fs.writeFile(newest, bytes);
  assert.equal((await pruneBackups({ archiveDir, keep: 1 })).length, 2);
});

test('restoring into a folder swaps the log in one step and keeps secrets', async () => {
  const dir = await tmp('todir');
  const log = path.join(dir, 'src.lino');
  await writeLog(log, 6);
  const made = await makeBackup(logStore(log), {
    archiveDir: path.join(dir, 'a'),
  });
  const target = path.join(dir, 'store');
  assert.equal(await restoreBackupToDir(made.file, target), 6);
  assert.equal(
    (await fs.readFile(path.join(target, 'data.lino'), 'utf8')).split('\n')
      .length,
    7
  );
  // A folder that holds a store is not replaced unless asked.
  await assert.rejects(restoreBackupToDir(made.file, target), {
    code: 'BACKUP_TARGET_NOT_EMPTY',
  });
  // Replacing carries the folder's own secrets over (a plain archive has none).
  await fs.appendFile(
    path.join(target, 'data.lino'),
    `${encodeLine({ obj: { id: 'secret:keep', tokens: [], value: 'K' } })}\n`
  );
  await fs.writeFile(path.join(target, 'data.bin'), 'stale');
  await restoreBackupToDir(made.file, target, { replace: true });
  const text = await fs.readFile(path.join(target, 'data.lino'), 'utf8');
  assert.ok(text.includes('secret:keep'));
  assert.equal(
    await fs.stat(path.join(target, 'data.bin')).catch(() => null),
    null
  );
  const names = await fs.readdir(target);
  assert.ok(names.some((n) => n.startsWith('data.lino.before-restore-')));
  // A damaged archive changes nothing.
  const bad = path.join(dir, 'meta-sovereign-bad.msbk');
  const bytes = await fs.readFile(made.file);
  bytes[bytes.length - 30] ^= 0xff;
  await fs.writeFile(bad, bytes);
  const before = await fs.readFile(path.join(target, 'data.lino'), 'utf8');
  await assert.rejects(restoreBackupToDir(bad, target, { replace: true }), {
    code: /^BACKUP_/,
  });
  assert.equal(
    await fs.readFile(path.join(target, 'data.lino'), 'utf8'),
    before
  );
});

// V8 heap measurement; Bun (JavaScriptCore) has no V8 flags (the readFile
// spy in backup-schema.test.js covers streaming there).
const inV8 = typeof Bun === 'undefined';
test(
  'a 200k-link store backs up in bounded memory',
  { skip: !inV8 || process.env.RUN_BACKUP_STRESS !== '1', timeout: 120_000 },
  async () => {
    const dir = await tmp('mem');
    const log = path.join(dir, 'data.lino');
    const COUNT = Number(process.env.R_Z16_LINKS) || 200_000;
    await writeLog(log, COUNT, (i) =>
      link(i, { body: `message number ${i} ${'lorem ipsum '.repeat(8)}` })
    );
    const size = (await fs.stat(log)).size;
    // A collection before each sample, so the peak is what is live, not
    // garbage the collector has not got to yet.
    v8.setFlagsFromString('--expose-gc');
    const collect = vm.runInNewContext('gc');
    collect();
    const base = process.memoryUsage().heapUsed;
    let peak = base;
    const timer = setInterval(() => {
      collect();
      peak = Math.max(peak, process.memoryUsage().heapUsed);
    }, 25);
    const started = Date.now();
    let made;
    try {
      made = await makeBackup(logStore(log), {
        archiveDir: path.join(dir, 'a'),
        passphrase: 'pw',
      });
    } finally {
      clearInterval(timer);
    }
    const ms = Date.now() - started;
    const growth = peak - base;
    console.log(
      `# R-Z16 backup: ${COUNT} links, log ${(size / 1e6).toFixed(0)} MB -> ` +
        `${(made.bytes / 1e6).toFixed(0)} MB in ${ms} ms, live heap growth ${(growth / 1e6).toFixed(1)} MB`
    );
    assert.equal(made.links, COUNT);
    assert.ok(growth < 32 * 1024 * 1024, `heap grew ${growth} bytes`);
    // The store restores from it, also in bounded memory.
    const target = createMemoryStore();
    assert.equal(
      await restoreBackup(target, made.file, { passphrase: 'pw' }),
      COUNT
    );
    assert.equal(await countLinks(target), COUNT);
  }
);

test('the CLI backs up a store and restores it over another folder', async () => {
  const { runCli } = await import('../src/cli/index.js');
  const dir = await tmp('cli');
  const store = path.join(dir, 'store');
  const first = await openDualStore(store);
  await first.putMany([link(1), link(2)]);
  await first.flush();
  first.close();
  const log = () => {};
  const archives = path.join(dir, 'a');
  assert.equal(
    await runCli(['backup', `--store=${store}`, `--archive=${archives}`], {
      log,
    }),
    0
  );
  const name = (await fs.readdir(archives)).find((n) => n.endsWith('.msbk'));
  const other = path.join(dir, 'other');
  const file = path.join(archives, name);
  assert.equal(
    await runCli(
      ['restore', `--file=${file}`, `--store=${other}`, '--replace'],
      { log }
    ),
    0
  );
  const text = await fs.readFile(path.join(other, 'data.lino'), 'utf8');
  assert.ok(text.includes('msg:z:2'));
});
