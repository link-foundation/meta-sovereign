import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import {
  createBrowserStore,
  createLocalStorageDriver,
} from '../src/storage/browser-store.js';
import { openCausalBrowserStore } from '../src/storage/open-browser-store.js';
import { snapshotNotifications } from '../src/storage/browser-coordination.js';
import { snapshotLocks, snapshotStorage } from './helpers/snapshot-locks.mjs';

const setup = (t, { notify = true } = {}) => {
  const storage = snapshotStorage();
  const locks = snapshotLocks();
  const roots = new Map();
  const stores = [];
  const errors = [];
  const driver = (key = 'shared') => {
    if (!roots.has(key)) {
      roots.set(key, new Set());
    }
    const listeners = roots.get(key);
    return createLocalStorageDriver(storage, key, {
      locks,
      notifications: {
        watch(handler) {
          listeners.add(handler);
          return () => listeners.delete(handler);
        },
        publish() {
          if (notify) {
            for (const handler of listeners) {
              globalThis.queueMicrotask(handler);
            }
          }
        },
      },
    });
  };
  const open = async (key = 'shared', options = {}) => {
    const store = await openCausalBrowserStore({
      driver: driver(key),
      onError: (error) => errors.push(error.code),
      ...options,
    });
    stores.push(store);
    await store.refresh();
    return store;
  };
  t.after(async () => {
    await Promise.all(stores.map((store) => store.close()));
    for (const listeners of roots.values()) {
      assert.equal(listeners.size, 0, 'all root subscriptions are closed');
    }
  });
  return { storage, locks, driver, open, errors };
};

const eventually = async (condition) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await condition()) {
      return;
    }
    await nextTurn();
  }
  assert.fail('browser roots did not converge');
};

test(
  'editable browser openings merge concurrent inserts and refresh live peers',
  { timeout: 3000 },
  async (t) => {
    const fixture = setup(t);
    const [first, second] = await Promise.all([fixture.open(), fixture.open()]);
    await Promise.all([
      first.put({ id: 'first', body: 'one owner' }),
      second.put({ id: 'second', body: 'another owner' }),
    ]);
    await eventually(
      async () => (await first.get('second')) && (await second.get('first'))
    );
    const reopened = await fixture.open();
    assert.equal((await reopened.get('first')).body, 'one owner');
    assert.equal((await reopened.get('second')).body, 'another owner');
    assert.deepEqual(fixture.errors, []);
  }
);

test(
  'stale public edits and deletion converge with causal metadata rather than resurrecting payloads',
  { timeout: 3000 },
  async (t) => {
    const fixture = setup(t, { notify: false });
    const first = await fixture.open();
    await first.put({ id: 'shared', body: 'baseline', children: ['base'] });
    const second = await fixture.open();
    await Promise.all([
      first.put({ id: 'shared', body: 'left', children: ['left'] }),
      second.put({ id: 'shared', body: 'right', children: ['right'] }),
    ]);
    await Promise.all([first.refresh(), second.refresh()]);
    assert.deepEqual(await first.get('shared'), await second.get('shared'));
    assert.deepEqual((await first.get('shared')).children, ['left', 'right']);
    assert.equal(Object.keys((await first.get('shared')).vc).length, 2);
    const stale = await fixture.open();
    await first.delete('shared');
    await stale.put({ id: 'independent', body: 'keep this too' });
    await stale.refresh();
    assert.equal(await stale.get('shared'), null);
    const saved = await fixture.open();
    assert.equal(await saved.get('shared'), null);
    assert.equal((await saved.get('independent')).body, 'keep this too');
    const raw = JSON.parse(fixture.storage.getItem('shared')).links.find(
      (link) => link.id === 'shared'
    );
    assert.equal(raw.__msSyncDeleted, 1);
    assert.equal(raw.body, undefined);
  }
);

test(
  'private records refresh locally, isolate accounts and refuse concurrent conflicting credentials',
  { timeout: 3000 },
  async (t) => {
    const fixture = setup(t, { notify: false });
    const first = await fixture.open();
    await first.put({ id: 'secret:credential', body: 'baseline' });
    const second = await fixture.open();
    const other = await fixture.open('other-account');
    await first.put({ id: 'secret:credential', body: 'committed replacement' });
    await assert.rejects(
      second.put({ id: 'secret:credential', body: 'unsaved replacement' }),
      { code: 'STORE_SNAPSHOT_CHANGED' }
    );
    assert.equal(
      (await second.get('secret:credential')).body,
      'unsaved replacement'
    );
    assert.equal(
      (await (await fixture.open()).get('secret:credential')).body,
      'committed replacement'
    );
    assert.equal(await other.get('secret:credential'), null);
    await other.put({ id: 'other', body: 'account isolated' });
    assert.equal(await first.get('other'), null);
  }
);

test(
  'quota refusal retains owner memory and a later explicit flush merges another tab commit',
  { timeout: 3000 },
  async (t) => {
    const fixture = setup(t);
    const first = await fixture.open();
    const second = await fixture.open();
    const set = fixture.storage.setItem;
    fixture.storage.setItem = () => {
      throw new Error('fixture quota');
    };
    await assert.rejects(
      first.put({ id: 'draft', body: 'unsaved' }),
      /fixture quota/
    );
    fixture.storage.setItem = set;
    await second.put({ id: 'other', body: 'durable' });
    await eventually(async () => first.get('other'));
    assert.equal(await second.get('draft'), null);
    assert.equal((await first.get('draft')).body, 'unsaved');
    await first.flush();
    await eventually(async () => second.get('draft'));
    assert.equal((await (await fixture.open()).get('other')).body, 'durable');
  }
);

test(
  'a newer schema or noncausal physical removal refuses without overwriting the durable root',
  { timeout: 3000 },
  async (t) => {
    const fixture = setup(t, { notify: false });
    const first = await fixture.open();
    await first.put({ id: 'record', body: 'old' });
    let raw = await createBrowserStore({ driver: fixture.driver() });
    await raw.delete('record');
    const physical = fixture.storage.getItem('shared');
    await assert.rejects(first.put({ id: 'new', body: 'unsaved' }), {
      code: 'STORE_SNAPSHOT_CHANGED',
    });
    assert.equal(fixture.storage.getItem('shared'), physical);
    raw = await createBrowserStore({ driver: fixture.driver() });
    await raw.put({ id: 'meta:schema', version: 99 });
    const future = fixture.storage.getItem('shared');
    await assert.rejects(first.refresh(), { code: 'STORE_SNAPSHOT_CHANGED' });
    await assert.rejects(first.flush(), { code: 'STORE_SNAPSHOT_CHANGED' });
    assert.equal(fixture.storage.getItem('shared'), future);
    await assert.rejects(fixture.open(), { code: 'STORE_TOO_NEW' });
  }
);

test(
  'abort detaches automatic refresh and close drains an already queued refresh',
  { timeout: 3000 },
  async (t) => {
    const fixture = setup(t);
    const lifetime = new AbortController();
    const first = await fixture.open('shared', { signal: lifetime.signal });
    const second = await fixture.open();
    lifetime.abort();
    await first.close();
    await second.put({ id: 'later', body: 'durable' });
    await nextTurn();
    assert.equal(await first.get('later'), null);
    await first.refresh();
    assert.equal((await first.get('later')).body, 'durable');
  }
);

test(
  'busy coordination has a finite retry budget and retains the unsaved owner value',
  { timeout: 3000 },
  async (t) => {
    const fixture = setup(t, { notify: false });
    const store = await fixture.open();
    await fixture.locks.request(
      'meta-sovereign:snapshot:shared',
      {},
      async () => {
        await assert.rejects(store.put({ id: 'draft', body: 'keep' }), {
          code: 'STORE_SNAPSHOT_BUSY',
        });
      }
    );
    assert.equal((await store.get('draft')).body, 'keep');
    assert.equal(await (await fixture.open()).get('draft'), null);
    await store.flush();
    assert.equal((await (await fixture.open()).get('draft')).body, 'keep');
  }
);

test(
  'an owner write admitted during a slow refresh survives the merge and durable save',
  { timeout: 3000 },
  async (t) => {
    const fixture = setup(t, { notify: false });
    const base = fixture.driver();
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    let hold = false;
    const first = await fixture.open('shared', {
      driver: {
        ...base,
        async load() {
          const snapshot = await base.load();
          if (hold) {
            hold = false;
            entered.resolve();
            await release.promise;
          }
          return snapshot;
        },
      },
    });
    const second = await fixture.open();
    await second.put({ id: 'remote', body: 'committed' });
    hold = true;
    const refreshing = first.refresh();
    try {
      await entered.promise;
      const writing = first.put({ id: 'during-refresh', body: 'latest owner' });
      release.resolve();
      await Promise.all([refreshing, writing]);
    } finally {
      release.resolve();
      await refreshing;
    }
    const saved = await fixture.open();
    assert.equal((await saved.get('remote')).body, 'committed');
    assert.equal((await saved.get('during-refresh')).body, 'latest owner');
  }
);

test(
  'a subscriber edit during remote admission retains its new owner clock and payload',
  { timeout: 3000 },
  async (t) => {
    const fixture = setup(t, { notify: false });
    const first = await fixture.open();
    const second = await fixture.open();
    let editing;
    const off = first.subscribe((event) => {
      if (event.link.id === 'remote' && event.link.body === 'remote value') {
        editing = first.put({ id: 'remote', body: 'subscriber owner edit' });
      }
    });
    await second.put({ id: 'remote', body: 'remote value' });
    await first.refresh();
    await editing;
    off();
    const saved = await fixture.open();
    assert.equal((await saved.get('remote')).body, 'subscriber owner edit');
    assert.equal(Object.keys((await saved.get('remote')).vc).length, 2);
  }
);

test(
  'independent private additions and private deletion refresh without causal metadata',
  { timeout: 3000 },
  async (t) => {
    const fixture = setup(t);
    const first = await fixture.open();
    const second = await fixture.open();
    await Promise.all([
      first.put({ id: 'secret:first', body: 'private one' }),
      second.put({ id: 'secret:second', body: 'private two' }),
    ]);
    await eventually(
      async () =>
        (await first.get('secret:second')) && (await second.get('secret:first'))
    );
    assert.equal((await first.get('secret:second')).vc, undefined);
    await first.delete('secret:second');
    await eventually(async () => (await second.get('secret:second')) === null);
    assert.equal(
      (await (await fixture.open()).get('secret:first')).body,
      'private one'
    );
  }
);

test(
  'close drains subscriber writes admitted by an already running refresh',
  { timeout: 3000 },
  async (t) => {
    const fixture = setup(t, { notify: false });
    const base = fixture.driver();
    const reading = Promise.withResolvers();
    const releaseRead = Promise.withResolvers();
    const saving = Promise.withResolvers();
    const releaseSave = Promise.withResolvers();
    let hold = false;
    const first = await fixture.open('shared', {
      driver: {
        ...base,
        async load() {
          const snapshot = await base.load();
          if (hold) {
            reading.resolve();
            await releaseRead.promise;
          }
          return snapshot;
        },
        async save(snapshot, options) {
          if (hold) {
            saving.resolve();
            await releaseSave.promise;
          }
          return base.save(snapshot, options);
        },
      },
    });
    const second = await fixture.open();
    await second.put({ id: 'remote', body: 'committed' });
    let editing;
    const off = first.subscribe((event) => {
      if (event.link.id === 'remote') {
        editing = first.put({ id: 'reaction', body: 'owner response' });
      }
    });
    hold = true;
    const refreshing = first.refresh();
    await reading.promise;
    let closed = false;
    const closing = first.close().then(() => {
      closed = true;
    });
    let observed;
    try {
      releaseRead.resolve();
      await saving.promise;
      await nextTurn();
      observed = closed;
    } finally {
      releaseRead.resolve();
      releaseSave.resolve();
      await Promise.all([refreshing, editing, closing]);
      off();
    }
    assert.equal(
      observed,
      false,
      'the admitted subscriber write is still pending'
    );
    assert.equal(
      (await (await fixture.open()).get('reaction')).body,
      'owner response'
    );
  }
);

test('snapshot notifications carry only invalidation and cannot turn a durable success into a refusal', async () => {
  const messages = [];
  let closed = 0;
  const notifications = snapshotNotifications('root', {
    Channel: class {
      postMessage(value) {
        messages.push(value);
        throw new Error('messaging disabled');
      }
      close() {
        closed += 1;
      }
    },
  });
  const driver = createLocalStorageDriver(snapshotStorage(), 'root', {
    locks: snapshotLocks(),
    notifications,
  });
  await driver.save({
    links: [{ id: 'secret:private', body: 'never broadcast' }],
  });
  assert.deepEqual(messages, [{ changed: true }]);
  assert.equal(closed, 1);
});
