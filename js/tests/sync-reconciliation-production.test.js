// Parent-compatible imports keep both failures reproducible on 4bfeaf2c.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openDualStore } from '../src/storage/dual-store.js';
import { createPeer, loopback } from '../src/sync/peer.js';
import { waitReconciled } from './helpers/reconciliation.mjs';

for (const erased of [false, true]) {
  test(
    `durable reopen reconciles an offline ${erased ? 'deletion' : 'edit'} and preserves it on disk`,
    { timeout: 10000 },
    async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-reconcile-'));
      let a;
      let b;
      const stops = [];
      try {
        a = await openDualStore(path.join(dir, 'a'));
        b = await openDualStore(path.join(dir, 'b'));
        const old = await a.put({ id: 'shared', body: 'old' });
        await createPeer(b).receive({ type: 'put', link: old });
        await a.close();
        a = await openDualStore(path.join(dir, 'a'));
        if (erased) {
          await a.delete(old.id);
        } else {
          await a.put({ id: old.id, body: 'offline edit' });
        }
        await a.close();
        a = await openDualStore(path.join(dir, 'a'));
        const wire = loopback();
        const errors = [];
        const options = {
          schemaVersion: 13,
          onError: (error) => errors.push(error),
        };
        stops.push(
          createPeer(a, options).connect(wire.a),
          createPeer(b, options).connect(wire.b)
        );
        await waitReconciled(
          async () => {
            await wire.settle();
            const current = await b.get(old.id);
            return erased ? current === null : current?.body === 'offline edit';
          },
          `offline ${erased ? 'deletion' : 'edit'}`
        );
        stops.splice(0).forEach((stop) => stop());
        await b.close();
        b = await openDualStore(path.join(dir, 'b'));
        await createPeer(b).receive({ type: 'put', link: old });
        assert.equal(
          (await b.get(old.id))?.body ?? null,
          erased ? null : 'offline edit'
        );
        assert.deepEqual(await b.verify(), []);
        assert.deepEqual(errors, []);
      } finally {
        stops.forEach((stop) => stop());
        await a?.close();
        await b?.close();
        await rm(dir, { recursive: true, force: true });
      }
    }
  );
}
