import test from 'node:test';
import assert from 'node:assert/strict';
import { createPeer, loopback } from '../src/sync/peer.js';
import { syncRecords } from '../src/storage/sync-deletions.js';
import { replicatedMutation } from '../src/storage/mutation.js';
import {
  causalMemory,
  waitReconciled,
  captureReconciliation,
} from './helpers/reconciliation.mjs';

const connect = (a, b, errors = []) => {
  const wire = loopback();
  const options = { schemaVersion: 13, onError: (error) => errors.push(error) };
  const stops = [
    createPeer(a, options).connect(wire.a),
    createPeer(b, options).connect(wire.b),
  ];
  return {
    async until(predicate) {
      await waitReconciled(async () => {
        await wire.settle();
        return predicate();
      });
    },
    close: () => stops.forEach((stop) => stop()),
  };
};

test(
  'records written before connecting reconcile both ways without archive queries or private records',
  { timeout: 5000 },
  async () => {
    const a = causalMemory('a');
    const b = causalMemory('b');
    await a.put({ id: 'left', body: 'written offline' });
    await b.put({ id: 'right', body: 'also offline' });
    await a.put({ id: 'secret:local', value: 'never transmit' });
    await a.put({ id: 'meta:schema', version: 13 });
    a.query = b.query = () =>
      assert.fail('reconciliation must scan incrementally');
    const errors = [];
    const net = connect(a, b, errors);
    try {
      await net.until(
        async () => (await a.get('right')) && (await b.get('left'))
      );
      assert.equal((await a.get('right')).body, 'also offline');
      assert.equal((await b.get('left')).body, 'written offline');
      assert.equal(await b.get('secret:local'), null);
      assert.equal(await b.get('meta:schema'), null);
      assert.deepEqual(errors, []);
    } finally {
      net.close();
    }
  }
);

test(
  'reconnecting catches offline edits and payload-free deletion clocks without resurrecting old data',
  { timeout: 5000 },
  async () => {
    const a = causalMemory('a');
    const b = causalMemory('b');
    const old = await a.put({ id: 'removed', body: 'old payload' });
    await a.put({ id: 'edited', body: 'old value' });
    let net = connect(a, b);
    try {
      await net.until(async () => Boolean(await b.get('edited')));
      net.close();
      await a.delete('removed');
      await b.put({ id: 'edited', body: 'edited while disconnected' });
      net = connect(a, b);
      await net.until(
        async () =>
          !(await b.get('removed')) &&
          (await a.get('edited'))?.body === 'edited while disconnected'
      );
      await createPeer(b).receive({ type: 'put', link: old });
      assert.equal(await b.get('removed'), null);
      const raw = [];
      await b[syncRecords].scan(
        (link) => link.id === 'removed',
        1,
        (batch) => raw.push(...batch)
      );
      assert.equal(raw[0].__msSyncDeleted, 1);
      assert.equal(raw[0].body, undefined);
      assert.deepEqual(raw[0].vc, { a: 2 });
    } finally {
      net.close();
    }
  }
);

test(
  'a source keeps one record in flight until its matching durable acknowledgement',
  { timeout: 5000 },
  async () => {
    const source = causalMemory('source');
    await source.put({ id: 'one', body: 'x'.repeat(16384) });
    await source.put({ id: 'two', body: 'y'.repeat(16384) });
    const capture = captureReconciliation(source);
    try {
      await capture.hello();
      await capture.receive({ type: 'sync-pull', request: 'request' });
      const records = () =>
        capture.sent.filter((event) => event.type === 'sync-record');
      await waitReconciled(() => records().length === 1);
      assert.equal(records()[0].sequence, 0);
      await capture.receive({
        type: 'sync-ack',
        request: 'wrong',
        sequence: 0,
      });
      await capture.receive({
        type: 'sync-ack',
        request: 'request',
        sequence: 9,
      });
      assert.equal(records().length, 1);
      await capture.receive({
        type: 'sync-ack',
        request: 'request',
        sequence: 0,
      });
      await waitReconciled(() => records().length === 2);
      assert.deepEqual(
        records().map((event) => event.mutation.link.id),
        ['one', 'two']
      );
      await capture.receive({
        type: 'sync-ack',
        request: 'request',
        sequence: 1,
      });
      await waitReconciled(() =>
        capture.sent.some((event) => event.type === 'sync-finish')
      );
      assert.deepEqual(capture.errors, []);
    } finally {
      capture.close();
    }
  }
);

test(
  'acknowledgement follows asynchronous mutation admission; duplicates do not replay it',
  { timeout: 5000 },
  async () => {
    const target = causalMemory('target');
    const released = Promise.withResolvers();
    let calls = 0;
    const update = target.update;
    target.update = async (...args) => {
      if (args[2]?.[replicatedMutation]) {
        calls++;
        await released.promise;
      }
      return update(...args);
    };
    const capture = captureReconciliation(target);
    try {
      await capture.hello();
      const pull = capture.sent.find((event) => event.type === 'sync-pull');
      const packet = {
        type: 'sync-record',
        request: pull.request,
        sequence: 0,
        mutation: {
          type: 'put',
          link: { id: 'durable', body: 'remote', vc: { remote: 1 } },
        },
      };
      const pending = capture.receive(packet);
      await waitReconciled(() => calls === 1);
      assert(!capture.sent.some((event) => event.type === 'sync-ack'));
      await capture.receive(packet);
      assert.equal(calls, 1);
      released.resolve();
      await pending;
      assert.equal((await target.get('durable')).body, 'remote');
      assert.equal(
        capture.sent.filter((event) => event.type === 'sync-ack').length,
        1
      );
      await capture.receive(packet);
      assert.equal(calls, 1);
      assert.equal(
        capture.sent.filter((event) => event.type === 'sync-ack').length,
        2
      );
    } finally {
      released.resolve();
      capture.close();
    }
  }
);

test(
  'wrong recipients and schemas cannot start data exchange; private records abort without acknowledgement',
  { timeout: 5000 },
  async () => {
    const target = causalMemory('target');
    const mismatches = [];
    const capture = captureReconciliation(target, {
      onMismatch: (error) => mismatches.push(error),
    });
    try {
      await capture.receive({
        type: 'hello',
        session: 'someone',
        reconcile: 1,
        schema: 12,
        to: 'unrelated',
      });
      assert.deepEqual(mismatches, []);
      await capture.hello();
      const pull = capture.sent.find((event) => event.type === 'sync-pull');
      const packet = {
        type: 'sync-record',
        request: pull.request,
        sequence: 0,
        mutation: {
          type: 'put',
          link: { id: 'secret:leak', value: 'never admit', vc: { remote: 1 } },
        },
      };
      await capture.receive({ ...packet, to: 'unrelated' });
      assert.deepEqual(capture.errors, []);
      await capture.receive(packet);
      assert.equal(await target.get('secret:leak'), null);
      assert(!capture.sent.some((event) => event.type === 'sync-ack'));
      assert.equal(capture.errors[0].code, 'SYNC_RECONCILE_INVALID');
      assert(capture.sent.some((event) => event.type === 'sync-abort'));
    } finally {
      capture.close();
    }
  }
);

test(
  'finite opening scan cannot grow indefinitely when live writes append new records',
  { timeout: 5000 },
  async () => {
    const source = causalMemory('source');
    await source.put({ id: 'initial' });
    const capture = captureReconciliation(source);
    try {
      await capture.hello();
      await capture.receive({ type: 'sync-pull', request: 'scan' });
      await waitReconciled(() =>
        capture.sent.some((event) => event.type === 'sync-record')
      );
      await source.put({ id: 'live-append' });
      await source.put({ id: 'another-append' });
      await capture.receive({ type: 'sync-ack', request: 'scan', sequence: 0 });
      await waitReconciled(() =>
        capture.sent.some((event) => event.type === 'sync-finish')
      );
      assert.equal(
        capture.sent.filter((event) => event.type === 'sync-record').length,
        1
      );
      assert(
        capture.sent.some(
          (event) => event.type === 'put' && event.link.id === 'live-append'
        )
      );
    } finally {
      capture.close();
    }
  }
);

test(
  'bounded sessions and idle timeout release blocked scans and report unfinished exchange',
  { timeout: 5000 },
  async () => {
    const source = causalMemory('source');
    await source.put({ id: 'one' });
    const capture = captureReconciliation(source, {
      reconciliation: { maxSessions: 1, timeoutMs: 20 },
    });
    try {
      await capture.hello();
      await capture.receive({ type: 'sync-pull', request: 'blocked' });
      await capture.hello('second');
      assert(
        capture.errors.some((error) => error.code === 'SYNC_RECONCILE_FULL')
      );
      await waitReconciled(() =>
        capture.errors.some((error) => error.code === 'SYNC_RECONCILE_TIMEOUT')
      );
      const count = capture.sent.filter(
        (event) => event.type === 'sync-record'
      ).length;
      await capture.receive({
        type: 'sync-ack',
        request: 'blocked',
        sequence: 0,
      });
      assert.equal(
        capture.sent.filter((event) => event.type === 'sync-record').length,
        count
      );
      assert(capture.sent.some((event) => event.type === 'sync-abort'));
    } finally {
      capture.close();
    }
  }
);
