import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { createDoubletsStore } from '../src/storage/doublets-store.js';
import { merge } from '../src/sync/peer.js';
import { SYNC_STAMP } from '../src/sync/register.js';

for (const [name, open] of [
  ['text', createLinoTextStore],
  ['binary', createDoubletsStore],
]) {
  test(
    `${name}: durable reopen does not promote the joined observed clock`,
    { timeout: 5000 },
    async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-sync-register-'));
      const file = path.join(dir, 'data');
      const [a, b, c] = [
        { id: 'shared', body: 'A', vc: { a: 2 } },
        { id: 'shared', body: 'B', vc: { b: 1 } },
        { id: 'shared', body: 'C', vc: { a: 1, b: 1 } },
      ];
      const stores = [];
      try {
        const first = await open(file);
        stores.push(first);
        await first.put(merge(a, b));
        await first.flush();
        await first.close?.();
        stores.pop();
        const reopened = await open(file);
        stores.push(reopened);
        const snapshot = await reopened.get('shared');
        assert.deepEqual(snapshot[SYNC_STAMP].clock, { a: 2 });
        const expected = merge(a, merge(b, c));
        await reopened.update('shared', (before) => merge(before, c));
        assert.deepEqual(await reopened.get('shared'), expected);
        await reopened.flush();
      } finally {
        for (const store of stores) {
          await store.flush();
          await store.close?.();
        }
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  );
}
