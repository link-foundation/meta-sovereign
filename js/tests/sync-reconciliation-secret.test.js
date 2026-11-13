import test from 'node:test';
import assert from 'node:assert/strict';
import { createPeer, loopback } from '../src/sync/peer.js';
import { wrapSecretStore } from '../src/storage/secret-store.js';
import { causalMemory, waitReconciled } from './helpers/reconciliation.mjs';

test(
  'encrypted stores retain catch-up and persistence barriers without transmitting private ciphertext',
  { timeout: 5000 },
  async () => {
    const raw = causalMemory('left');
    let flushes = 0;
    raw.flush = async () => {
      flushes++;
    };
    const left = wrapSecretStore({
      inner: raw,
      passphrase: 'fixture-passphrase',
    });
    const right = wrapSecretStore({
      inner: causalMemory('right'),
      passphrase: 'other-fixture-passphrase',
    });
    await left.put({ id: 'secret:local', value: 'private fixture' });
    await left.put({ id: 'ordinary', body: 'written before connect' });
    const old = await left.put({ id: 'removed', body: 'old' });
    await createPeer(right).receive({ type: 'put', link: old });
    await left.delete(old.id);
    await right.put({ id: 'reverse', body: 'reverse offline' });
    const wire = loopback();
    const sent = [];
    const send = wire.a.send;
    wire.a.send = (event) => {
      sent.push(event);
      return send(event);
    };
    const errors = [];
    const options = {
      schemaVersion: 13,
      onError: (error) => errors.push(error),
    };
    const stops = [
      createPeer(left, options).connect(wire.a),
      createPeer(right, options).connect(wire.b),
    ];
    try {
      await waitReconciled(async () => {
        await wire.settle();
        return (
          (await right.get('ordinary')) &&
          !(await right.get('removed')) &&
          (await left.get('reverse'))
        );
      });
      assert.equal((await left.get('secret:local')).value, 'private fixture');
      assert.equal(await right.get('secret:local'), null);
      assert(
        !sent.some((event) => event.mutation?.link?.id.startsWith('secret:'))
      );
      assert(flushes > 0);
      assert.deepEqual(errors, []);
    } finally {
      stops.forEach((stop) => stop());
    }
  }
);
