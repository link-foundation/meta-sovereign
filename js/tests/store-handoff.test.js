import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, appendFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openDualStore, openWarmDualStore } from '../src/storage/dual-store.js';
import {
  createLinoTextStore,
  formatLinoRecords,
} from '../src/storage/lino-store.js';
import { logCheckpoint } from '../src/storage/lino-handoff.js';
import { acquireStoreLock } from '../src/storage/store-lock.js';

test('a warm replacement follows writes and deletions while enforcing one writer; rollback catches up too', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-handoff-'));
  let owner, replacement;
  try {
    owner = await openDualStore(dir);
    await owner.put({ id: 'message:one', body: 'original' });
    await owner.put({ id: 'message:removed', body: 'remove later' });
    const checkpoint = await owner.prepareHandoff();
    replacement = await openWarmDualStore(dir, checkpoint);
    await assert.rejects(replacement.put({ id: 'premature' }), {
      code: 'STORE_READ_ONLY',
    });
    await owner.put({ id: 'message:one', body: 'updated while warming' });
    await owner.put({ id: 'message:new', body: 'new while warming' });
    await owner.delete('message:removed');
    assert.equal((await replacement.get('message:one')).body, 'original');
    await assert.rejects(replacement.promote(checkpoint), {
      code: 'STORE_LOCKED',
    });
    await owner.releaseForHandoff();
    await replacement.promote(checkpoint);
    assert.equal(
      (await replacement.get('message:one')).body,
      'updated while warming'
    );
    assert.equal(
      (await replacement.get('message:new')).body,
      'new while warming'
    );
    assert.equal(await replacement.get('message:removed'), null);
    await assert.rejects(owner.put({ id: 'old-owner-write' }), {
      code: 'STORE_READ_ONLY',
    });
    await assert.rejects(acquireStoreLock(dir, { exclusive: true }), {
      code: 'STORE_LOCKED',
    });
    await replacement.put({
      id: 'message:after-upgrade',
      body: 'preserve on rollback',
    });
    await replacement.prepareHandoff();
    await replacement.releaseForHandoff();
    await owner.promote();
    assert.equal(
      (await owner.get('message:after-upgrade')).body,
      'preserve on rollback'
    );
    await owner.put({ id: 'message:rollback', body: 'writer restored' });
  } finally {
    await replacement?.close();
    await owner?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('a warm read stops at its checkpoint and rejects an unfinished handoff tail', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-handoff-tail-'));
  try {
    const file = path.join(dir, 'data.lino');
    await appendFile(file, formatLinoRecords([{ id: 'one' }]));
    const checkpoint = await logCheckpoint(file);
    await appendFile(file, formatLinoRecords([{ id: 'two' }]));
    const warm = await createLinoTextStore(file, {
      readOnly: true,
      readLimit: checkpoint.bytes,
    });
    assert.equal(await warm.get('two'), null);
    await appendFile(file, '(unfinished');
    await assert.rejects(warm.promote(checkpoint), {
      code: 'STORE_HANDOFF_INVALID',
    });
    await assert.rejects(warm.put({ id: 'blocked' }), {
      code: 'STORE_READ_ONLY',
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
