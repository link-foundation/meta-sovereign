import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLinoTextStore } from '../src/storage/lino-store.js';

const record = (body) => ({ id: 'record', body });
const writes = {
  put: (store, body) => store.put(record(body)),
  update: (store, body) => store.update('record', () => record(body)),
  putMany: (store, body) => store.putMany([record(body)]),
  delete: (store) => store.delete('record'),
};
for (const outer of ['put', 'update', 'putMany']) {
  for (const inner of ['put', 'putMany', 'delete']) {
    test(
      `text log preserves ${outer} followed by a subscriber's ${inner} on reopen`,
      { timeout: 3000 },
      async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-log-order-'));
        const file = path.join(dir, 'data.lino');
        let store;
        let reopened;
        try {
          store = await createLinoTextStore(file);
          await store.put(record('initial'));
          let next;
          let once = true;
          store.subscribe((event) => {
            if (once && event.link.id === 'record') {
              once = false;
              next = writes[inner](store, 'subscriber edit');
            }
          });
          await writes[outer](store, 'outer edit');
          await next;
          await store.flush();
          const expected = await store.query();
          await store.close();
          store = null;
          reopened = await createLinoTextStore(file);
          assert.deepEqual(await reopened.query(), expected);
        } finally {
          await store?.flush();
          await store?.close();
          await reopened?.close();
          await rm(dir, { recursive: true, force: true });
        }
      }
    );
  }
}

test(
  'a subscriber cannot interleave memory changes inside a bulk append',
  { timeout: 3000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-log-bulk-order-'));
    let store;
    let reopened;
    let next;
    try {
      const file = path.join(dir, 'data.lino');
      store = await createLinoTextStore(file);
      store.subscribe(({ link }) => {
        if (link.id === 'trigger') {
          next = store.put(record('subscriber edit'));
        }
      });
      await store.putMany([{ id: 'trigger' }, record('outer edit')]);
      await next;
      await store.flush();
      assert.deepEqual(await store.get('record'), record('subscriber edit'));
      const expected = await store.query();
      await store.close();
      store = null;
      reopened = await createLinoTextStore(file);
      assert.deepEqual(await reopened.query(), expected);
    } finally {
      await next;
      await store?.flush();
      await store?.close();
      await reopened?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test(
  'flush includes every mutation already called even before its write promise settles',
  { timeout: 3000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-log-flush-order-'));
    let store;
    let reader;
    let pending = [];
    try {
      const file = path.join(dir, 'data.lino');
      store = await createLinoTextStore(file);
      pending = [store.put(record('first')), store.put(record('last'))];
      await store.flush();
      reader = await createLinoTextStore(file);
      assert.equal((await reader.get('record'))?.body, 'last');
    } finally {
      await Promise.allSettled(pending);
      await store?.flush();
      await store?.close();
      await reader?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);

for (const operation of ['put', 'putMany', 'update']) {
  test(
    `text ${operation} captures its record before subscriber mutation`,
    { timeout: 3000 },
    async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-log-input-'));
      let store;
      let reopened;
      try {
        const file = path.join(dir, 'data.lino');
        store = await createLinoTextStore(file);
        store.subscribe(({ link }) => {
          link.id = 'mutated';
          link.body = 'subscriber mutation';
        });
        await writes[operation](store, 'captured');
        assert.deepEqual(await store.get('record'), record('captured'));
        await store.flush();
        await store.close();
        store = null;
        reopened = await createLinoTextStore(file);
        assert.deepEqual(await reopened.query(), [record('captured')]);
      } finally {
        await store?.flush();
        await store?.close();
        await reopened?.close();
        await rm(dir, { recursive: true, force: true });
      }
    }
  );
}

test(
  'failed admission cannot block a later write or delay its memory snapshot',
  { timeout: 3000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-log-rejected-'));
    let store;
    let reopened;
    try {
      const file = path.join(dir, 'data.lino');
      store = await createLinoTextStore(file);
      const invalid = store.update('record', () => ({ id: 'wrong' }));
      const input = record('captured');
      const saved = store.put(input);
      // Preserve the existing immediate memory mutation while disk is pending.
      const current = store.get('record');
      input.body = 'caller mutation';
      await assert.rejects(invalid, /same id/);
      await saved;
      assert.deepEqual(await current, record('captured'));
      await store.flush();
      await store.close();
      store = null;
      reopened = await createLinoTextStore(file);
      assert.deepEqual(await reopened.query(), [record('captured')]);
    } finally {
      await store?.flush();
      await store?.close();
      await reopened?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);
