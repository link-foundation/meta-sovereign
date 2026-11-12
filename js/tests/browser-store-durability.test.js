import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserStore } from '../src/storage/browser-store.js';

const turn = () => new Promise((resolve) => globalThis.queueMicrotask(resolve));
const fixture = async () => {
  let snapshot = { links: [] };
  const saves = [];
  const driver = {
    load: async () => globalThis.structuredClone(snapshot),
    save: (next) =>
      new Promise((resolve, reject) => {
        saves.push({
          snapshot: globalThis.structuredClone(next),
          resolve: () => {
            snapshot = globalThis.structuredClone(next);
            resolve();
          },
          reject,
        });
      }),
  };
  const store = await createBrowserStore({ driver });
  const events = [];
  store.subscribe((event) => events.push(event));
  return { store, saves, events, driver };
};

test(
  'browser writes acknowledge and become visible only after durable persistence',
  { timeout: 2000 },
  async () => {
    const f = await fixture();
    let acknowledged = false;
    const write = f.store.put({ id: 'a', tokens: ['saved'] }).then(() => {
      acknowledged = true;
    });
    await turn();
    assert.equal(f.saves.length, 1);
    assert.equal(acknowledged, false);
    assert.equal(await f.store.get('a'), null);
    assert.equal(f.store.size(), 0);
    assert.deepEqual(f.events, []);
    f.saves[0].resolve();
    await write;
    assert.equal(acknowledged, true);
    assert.equal((await f.store.get('a')).tokens[0], 'saved');
    assert.equal(f.events.length, 1);
    const reloaded = await createBrowserStore({ driver: f.driver });
    assert.equal((await reloaded.get('a')).tokens[0], 'saved');
  }
);

test(
  'browser snapshots serialize writes and flush; same-turn writes share one save',
  { timeout: 2000 },
  async () => {
    const f = await fixture();
    const first = f.store.put({ id: 'a', tokens: ['one'] });
    const sameTurn = f.store.put({ id: 'b', tokens: ['two'] });
    await turn();
    assert.equal(f.saves.length, 1);
    assert.deepEqual(
      f.saves[0].snapshot.links.map((link) => link.id),
      ['a', 'b']
    );
    const second = f.store.put({ id: 'a', tokens: ['new'] });
    const flush = f.store.flush();
    await turn();
    assert.equal(f.saves.length, 1, 'no overlapping driver saves');
    f.saves[0].resolve();
    await Promise.all([first, sameTurn]);
    await turn();
    assert.equal(f.saves.length, 2);
    f.saves[1].resolve();
    await Promise.all([second, flush]);
    const reloaded = await createBrowserStore({ driver: f.driver });
    assert.equal((await reloaded.get('a')).tokens[0], 'new');
    assert.equal((await reloaded.get('b')).tokens[0], 'two');
  }
);

test(
  'failed browser writes and deletes reject without committed state or events and permit recovery',
  { timeout: 2000 },
  async () => {
    const f = await fixture();
    const failed = assert.rejects(
      f.store.put({ id: 'a', tokens: ['lost'] }),
      /quota/
    );
    await turn();
    f.saves[0].reject(new Error('quota'));
    await failed;
    assert.equal(await f.store.get('a'), null);
    assert.deepEqual(f.events, []);
    const retry = f.store.put({ id: 'a', tokens: ['kept'] });
    await turn();
    f.saves[1].resolve();
    await retry;
    const removed = assert.rejects(f.store.delete('a'), /disk/);
    await turn();
    f.saves[2].reject(new Error('disk'));
    await removed;
    assert.equal((await f.store.get('a')).tokens[0], 'kept');
    assert.deepEqual(
      f.events.map((event) => event.type),
      ['put']
    );
    const reloaded = await createBrowserStore({ driver: f.driver });
    assert.equal((await reloaded.get('a')).tokens[0], 'kept');
  }
);

test(
  'browser batches validate before persistence and retain detached inputs',
  { timeout: 2000 },
  async () => {
    const f = await fixture();
    await assert.rejects(f.store.putMany([{ id: 'a' }, null]), /link.id/);
    assert.equal(f.saves.length, 0);
    assert.deepEqual(await f.store.query(), []);
    const links = [
      { id: 'a', tokens: ['original'] },
      { id: 'b', tokens: [] },
    ];
    const saved = f.store.putMany(links);
    links[0].tokens[0] = 'mutated';
    await turn();
    assert.equal(f.saves.length, 1);
    f.saves[0].resolve();
    await saved;
    assert.equal((await f.store.get('a')).tokens[0], 'original');
    assert.equal(f.events.length, 2);
  }
);
