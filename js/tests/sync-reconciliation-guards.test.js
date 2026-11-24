import test from 'node:test';
import assert from 'node:assert/strict';
import {
  causalMemory,
  captureReconciliation,
  waitReconciled,
} from './helpers/reconciliation.mjs';

test(
  'a rejected reconciliation send reports its original failure and cancels the scan',
  { timeout: 5000 },
  async () => {
    const store = causalMemory('source');
    await store.put({ id: 'one' });
    await store.put({ id: 'two' });
    const original = new Error('fixture transport rejected');
    const capture = captureReconciliation(store, {}, (event) =>
      event.type === 'sync-record' ? Promise.reject(original) : undefined
    );
    try {
      await capture.hello();
      await capture.receive({ type: 'sync-pull', request: 'rejected' });
      await waitReconciled(() => capture.errors.length > 0);
      assert.equal(capture.errors[0], original);
      assert.equal(
        capture.sent.filter((event) => event.type === 'sync-record').length,
        1
      );
      assert(capture.sent.some((event) => event.type === 'sync-abort'));
      await capture.receive({
        type: 'sync-ack',
        request: 'rejected',
        sequence: 0,
      });
      assert.equal(
        capture.sent.filter((event) => event.type === 'sync-record').length,
        1
      );
    } finally {
      capture.close();
    }
  }
);

test(
  'a foreign schema at a shared hub does not silence another matching session',
  { timeout: 5000 },
  async () => {
    const store = causalMemory('hub');
    const mismatches = [];
    const capture = captureReconciliation(store, {
      hub: true,
      onMismatch: (error) => mismatches.push(error),
    });
    try {
      await capture.receive({
        type: 'hello',
        schema: 12,
        session: 'foreign',
        reconcile: 1,
      });
      assert.equal(mismatches[0].code, 'SCHEMA_MISMATCH');
      await capture.hello();
      const pull = capture.sent.find((event) => event.type === 'sync-pull');
      await capture.receive(remoteRecord(pull.request));
      assert.equal((await store.get('shared')).body, 'remote');
      assert(capture.sent.some((event) => event.type === 'sync-ack'));
      assert.deepEqual(capture.errors, []);
    } finally {
      capture.close();
    }
  }
);

const remoteRecord = (request) => ({
  type: 'sync-record',
  request,
  sequence: 0,
  mutation: {
    type: 'put',
    link: { id: 'shared', body: 'remote', vc: { remote: 1 } },
  },
});

test(
  'a failed persistence barrier aborts without falsely acknowledging a received record',
  { timeout: 5000 },
  async () => {
    const store = causalMemory('target');
    const release = Promise.withResolvers();
    const diskError = new Error('fixture fsync failed');
    let flushing = false;
    store.flush = async () => {
      flushing = true;
      await release.promise;
      throw diskError;
    };
    const capture = captureReconciliation(store);
    try {
      await capture.hello();
      const pull = capture.sent.find((event) => event.type === 'sync-pull');
      const pending = capture.receive(remoteRecord(pull.request));
      await waitReconciled(() => flushing);
      assert.equal((await store.get('shared')).body, 'remote');
      assert(!capture.sent.some((event) => event.type === 'sync-ack'));
      release.resolve();
      await pending;
      assert.equal(capture.errors[0], diskError);
      assert(!capture.sent.some((event) => event.type === 'sync-ack'));
      assert(capture.sent.some((event) => event.type === 'sync-abort'));
    } finally {
      release.resolve();
      capture.close();
    }
  }
);

test(
  'schema refusal and disconnection cannot be revived by captured late callbacks',
  { timeout: 5000 },
  async () => {
    for (const mismatch of [false, true]) {
      const store = causalMemory('target');
      const refused = [];
      const capture = captureReconciliation(store, {
        onMismatch: (error) => refused.push(error),
      });
      try {
        if (mismatch) {
          await capture.receive({
            type: 'hello',
            schema: 12,
            session: 'remote',
            reconcile: 1,
          });
          assert.equal(refused[0].code, 'SCHEMA_MISMATCH');
        } else {
          capture.close();
        }
        const count = capture.sent.length;
        await capture.hello();
        await capture.receive({
          type: 'put',
          link: { id: 'late', vc: { remote: 1 } },
        });
        assert.equal(capture.sent.length, count);
        assert.equal(await store.get('late'), null);
      } finally {
        capture.close();
      }
    }
  }
);

test(
  'disconnect cancels a blocked scan without replay or false completion',
  { timeout: 5000 },
  async () => {
    const store = causalMemory('source');
    await store.put({ id: 'source-record' });
    const capture = captureReconciliation(store);
    try {
      await capture.hello();
      // An unacknowledged record is cancelled explicitly by disconnect, without
      // retry or a second record being retained in a replay queue.
      await capture.receive({ type: 'sync-pull', request: 'cancelled' });
      await waitReconciled(() =>
        capture.sent.some((event) => event.type === 'sync-record')
      );
      capture.close();
      const count = capture.sent.length;
      await capture.receive({
        type: 'sync-ack',
        request: 'cancelled',
        sequence: 0,
      });
      assert.equal(capture.sent.length, count);
      assert.deepEqual(capture.errors, []);
    } finally {
      capture.close();
    }
  }
);
