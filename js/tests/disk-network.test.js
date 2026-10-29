import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
  readFile,
  readdir,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createDiskNetwork,
  sqliteRuntime,
} from '../src/storage/disk-network.js';
import { encodeArchive } from '../src/storage/doublets-archive.js';
import { packetChunks } from '../src/storage/binary-packet-stream.js';
import {
  formatLinoRecords,
  tombstoneRecord,
} from '../src/storage/lino-store.js';
import { snapshotInWorker } from '../src/storage/doublets-mirror.js';
import { sweepSnapshotWorkspaces } from '../src/storage/snapshot-workspace.js';
import { snapshotMemory } from '../src/storage/snapshot-memory.js';

test('disk network writes the identical link-cli archive for nested, shared and Unicode values', async (t) => {
  if (!(await sqliteRuntime())) {
    t.skip('runtime has no built-in SQLite');
    return;
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-disk-network-'));
  const encoder = await createDiskNetwork(path.join(dir, 'network.sqlite'), {
    pointCache: 4,
    pairCache: 4,
  });
  try {
    const records = Array.from({ length: 20 }, (_, i) => ({
      id: `fixture:${i}`,
      raw: {
        message: 'Привет 😀\ud800',
        repeated: [null, true, false, 1.5, 'ms:nil', '', '123'],
      },
      absent: undefined,
      array: [{ same: i % 3 }, []],
    }));
    records.forEach((record) => encoder.add(record));
    const chunks = [];
    for (const packet of encoder.packets()) {
      for await (const chunk of packetChunks(packet, { chunkBytes: 64 })) {
        chunks.push(Buffer.from(chunk));
      }
    }
    assert.deepEqual(
      Buffer.concat(chunks),
      Buffer.from(encodeArchive(records))
    );
  } finally {
    encoder.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('snapshot live-position index preserves overwrites/deletions and removes its workspace', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-disk-snapshot-'));
  const log = path.join(dir, 'data.lino');
  const binary = path.join(dir, 'data.bin');
  try {
    const a = { id: 'a', raw: { text: 'old' } };
    const b = { id: 'b', raw: { text: 'removed' } };
    const newest = { id: 'a', raw: { text: 'new' } };
    const c = { id: 'c', body: 'kept' };
    await writeFile(
      log,
      formatLinoRecords([a, b, newest, c, tombstoneRecord('b')])
    );
    const result = await snapshotInWorker(log, binary);
    assert.equal(result.links, 2);
    assert.equal(result.engine, (await sqliteRuntime()) ? 'disk' : 'memory');
    assert.deepEqual(
      await readFile(binary),
      Buffer.from(encodeArchive([newest, c]))
    );
    assert.equal(
      (await readdir(dir)).some((name) => name.startsWith('.snapshot-db-')),
      false
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('cancelled snapshots clean up and stale cleanup preserves a live owner', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-snapshot-cancel-'));
  const live = `.snapshot-db-${process.pid}-fixture`;
  const stale = '.snapshot-db-2147483647-fixture';
  try {
    await mkdir(path.join(dir, live));
    await mkdir(path.join(dir, stale));
    await sweepSnapshotWorkspaces(dir);
    assert.deepEqual(await readdir(dir), [live]);
    const log = path.join(dir, 'data.lino');
    await writeFile(log, formatLinoRecords([{ id: 'a', body: 'fixture' }]));
    const controller = new AbortController();
    const pending = snapshotInWorker(log, path.join(dir, 'data.bin'), {
      signal: controller.signal,
    });
    // Cancel deterministically during asynchronous workspace setup; worker
    // startup speed must not decide this fixture's result.
    controller.abort(new Error('fixture cancellation'));
    await assert.rejects(pending, /fixture cancellation/);
    assert.deepEqual(
      (await readdir(dir)).filter((name) => name.startsWith('.snapshot-db-')),
      [live]
    );
    assert.deepEqual(snapshotMemory(), []);
    await assert.rejects(
      snapshotInWorker(dir, path.join(dir, 'data.bin')),
      /directory|EISDIR/i
    );
    assert.deepEqual(
      (await readdir(dir)).filter((name) => name.startsWith('.snapshot-db-')),
      [live]
    );
    assert.deepEqual(snapshotMemory(), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
