import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLiveSubset } from '../src/server/live-subset.js';
import { createMemoryStore } from '../src/storage/universal.js';

test('typing polls share one archive read and track replacement/deletion live', async () => {
  const store = createMemoryStore();
  await store.put({ id: 'typing:a', until: 1 });
  await store.put({ id: 'msg:b', body: 'unrelated history' });
  let scans = 0;
  const query = store.query;
  store.query = async (filter) => {
    scans += 1;
    return query(filter);
  };
  const read = createLiveSubset(store, (link) => link.id.startsWith('typing:'));
  const [first, second] = await Promise.all([read(), read()]);
  assert.deepEqual(first, second);
  for (let i = 0; i < 20; i++) {
    await read();
  }
  assert.equal(scans, 1);
  await store.put({ id: 'typing:a', until: 2 });
  await store.put({ id: 'typing:c', until: 3 });
  await store.delete('typing:a');
  assert.deepEqual(await read(), [{ id: 'typing:c', until: 3 }]);
});
test('changes arriving during initial subset loading override its stale snapshot', async () => {
  const store = createMemoryStore();
  await store.put({ id: 'typing:a', until: 1 });
  const query = store.query;
  store.query = async (filter) => {
    const old = await query(filter);
    await store.put({ id: 'typing:a', until: 2 });
    return old;
  };
  const read = createLiveSubset(store, () => true);
  assert.deepEqual(await read(), [{ id: 'typing:a', until: 2 }]);
});
