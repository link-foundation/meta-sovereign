import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBrowserStore,
  createLocalStorageDriver,
  createDoubletsWebDriver,
} from '../src/storage/browser-store.js';
import { withCausalWrites } from '../src/storage/causal-writes.js';
import { createOfflineClient } from '../src/web/client.js';
import { snapshotLocks, snapshotStorage } from './helpers/snapshot-locks.mjs';

const setup = () => {
  const storage = snapshotStorage();
  const locks = snapshotLocks();
  const driver = (key = 'shared') =>
    createLocalStorageDriver(storage, key, { locks });
  const open = (adapter = driver()) => createBrowserStore({ driver: adapter });
  return { storage, locks, driver, open };
};
const changed = { code: 'STORE_SNAPSHOT_CHANGED' };

for (const operation of ['insert', 'edit', 'delete', 'bulk', 'flush']) {
  test(
    `stale tab ${operation} cannot replace another tab's durable snapshot`,
    { timeout: 2000 },
    async () => {
      const { open } = setup();
      const writer = await open();
      await writer.put({ id: 'old', body: 'baseline' });
      const stale = await open();
      await writer.put({ id: 'new', body: 'committed in other tab' });
      const operations = {
        insert: () => stale.put({ id: 'draft', body: 'unsaved owner text' }),
        edit: () => stale.put({ id: 'old', body: 'unsaved edit' }),
        delete: () => stale.delete('old'),
        bulk: () => stale.putMany([{ id: 'draft' }, { id: 'other-draft' }]),
        flush: () => stale.flush(),
      };
      await assert.rejects(operations[operation], changed);
      await assert.rejects(stale.flush(), changed);
      const reopened = await open();
      assert.equal((await reopened.get('new')).body, 'committed in other tab');
      assert.equal((await reopened.get('old')).body, 'baseline');
      assert.equal(await reopened.get('draft'), null);
      if (operation === 'insert') {
        assert.equal((await stale.get('draft')).body, 'unsaved owner text');
      }
      await reopened.put({ id: 'recovered', body: 'fresh baseline' });
      assert.equal(
        (await (await open()).get('recovered')).body,
        'fresh baseline'
      );
    }
  );
}

test('a shared driver load cannot reset an already open store baseline', async () => {
  const { open, driver } = setup();
  const shared = driver();
  const first = await open(shared);
  const second = await open(shared);
  await first.put({ id: 'committed' });
  // A third opening updates the driver's direct-caller baseline.
  await open(shared);
  await assert.rejects(second.put({ id: 'stale' }), changed);
  assert.ok(await (await open()).get('committed'));
});

test('legacy snapshot comparison preserves records and detects old writers', async () => {
  const { open, storage } = setup();
  storage.setItem('shared', JSON.stringify({ links: [{ id: 'legacy' }] }));
  const first = await open();
  const stale = await open();
  await first.put({ id: 'new' });
  await assert.rejects(stale.delete('legacy'), changed);
  const current = await open();
  // A previous build can still write its old shape. Do not overwrite that
  // external commit merely because this tab has a revision token.
  storage.setItem('shared', JSON.stringify({ links: [{ id: 'external' }] }));
  await assert.rejects(current.flush(), changed);
  assert.deepEqual(
    (await (await open()).query()).map((l) => l.id),
    ['external']
  );
});

test('unavailable or busy coordination never writes and explicit retry is safe', async () => {
  const { storage, locks, open } = setup();
  const unsafe = await open(
    createLocalStorageDriver(storage, 'shared', { locks: null })
  );
  await assert.rejects(unsafe.put({ id: 'unsafe' }), {
    code: 'STORE_COORDINATION_UNAVAILABLE',
  });
  assert.equal(storage.getItem('shared'), null);
  const store = await open();
  await locks.request('meta-sovereign:snapshot:shared', {}, async () => {
    await assert.rejects(store.put({ id: 'pending' }), {
      code: 'STORE_SNAPSHOT_BUSY',
    });
    assert.equal(storage.getItem('shared'), null);
  });
  await store.flush();
  assert.ok(await (await open()).get('pending'));
});

test('failed commits do not advance a version; keys remain independent', async () => {
  const { storage, driver, open } = setup();
  const store = await open();
  const set = storage.setItem;
  const failure = new Error('fixture quota');
  storage.setItem = () => {
    throw failure;
  };
  await assert.rejects(
    store.put({ id: 'retry' }),
    (error) => error === failure
  );
  storage.setItem = set;
  await store.flush();
  const other = await open(driver('other-account'));
  await other.put({ id: 'other' });
  assert.equal(await (await open()).get('other'), null);
  assert.ok(await (await open()).get('retry'));
});

test('direct driver retry retains the initial version after a failed first save', async () => {
  const { storage, driver, open } = setup();
  const first = driver();
  const set = storage.setItem;
  storage.setItem = () => {
    throw new Error('fixture full storage');
  };
  await assert.rejects(
    first.save({ links: [{ id: 'pending' }] }),
    /full storage/
  );
  storage.setItem = set;
  await (await open()).put({ id: 'other-writer' });
  await assert.rejects(first.save({ links: [{ id: 'pending' }] }), changed);
  assert.ok(await (await open()).get('other-writer'));
});

test('doublets-web preserves legacy comparison and per-store versions', async () => {
  const { driver, storage } = setup();
  const doubletsWeb = {
    Link: class {},
    LinksConstants: class {},
    UnitedLinks: class {
      next = 0;
      create() {
        return ++this.next;
      }
      update() {}
    },
  };
  const shared = createDoubletsWebDriver({
    doubletsWeb,
    snapshotDriver: driver(),
  });
  storage.setItem(
    'shared',
    JSON.stringify({ links: [{ id: 'legacy' }], doubletsWeb: { records: 1 } })
  );
  const first = await createBrowserStore({ driver: shared });
  const stale = await createBrowserStore({ driver: shared });
  await first.put({ id: 'new' });
  await assert.rejects(stale.put({ id: 'stale' }), changed);
  const fresh = await createBrowserStore({ driver: shared });
  assert.deepEqual(
    (await fresh.query()).map((link) => link.id),
    ['legacy', 'new']
  );
  await fresh.put({ id: 'valid-after-reopen' });
  assert.equal(shared.stats().records, 3);
});

test('causal offline client propagates conflicts without claiming a saved receipt', async () => {
  const { open } = setup();
  const writer = withCausalWrites(await open(), { actor: 'first' });
  const stale = withCausalWrites(await open(), { actor: 'stale' });
  const client = createOfflineClient({ store: stale, server: null });
  try {
    await writer.put({ id: 'committed' });
    await assert.rejects(
      client.put({ id: 'draft', body: 'keep this' }),
      changed
    );
    assert.equal((await client.get('draft')).body, 'keep this');
    const durable = await open();
    assert.ok(await durable.get('committed'));
    assert.equal(await durable.get('draft'), null);
    assert.ok((await durable.get('committed')).vc.first);
    assert.equal(
      Object.hasOwn(await durable.get('committed'), '__msSnapshotRevision'),
      false
    );
  } finally {
    client.close();
  }
});
