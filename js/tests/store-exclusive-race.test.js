import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireStoreLock } from '../src/storage/store-lock.js';

test(
  'simultaneous exclusive requests from one process admit exactly one owner',
  { timeout: 5000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'store-exclusive-race-'));
    let results = [];
    try {
      results = await Promise.allSettled([
        acquireStoreLock(dir, { exclusive: true }),
        acquireStoreLock(dir, { exclusive: true }),
      ]);
      assert.equal(
        results.filter((result) => result.status === 'fulfilled').length,
        1
      );
      assert.equal(
        results.find((result) => result.status === 'rejected')?.reason.code,
        'STORE_LOCKED'
      );
    } finally {
      for (const result of results) {
        if (result.status === 'fulfilled') {
          await result.value.release();
        }
      }
      await rm(dir, { recursive: true, force: true });
    }
  }
);
