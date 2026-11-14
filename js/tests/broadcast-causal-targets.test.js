import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { withCausalWrites } from '../src/storage/causal-writes.js';
import { createPeer } from '../src/sync/peer.js';
import { SYNC_STAMP } from '../src/sync/register.js';
import {
  listTargets,
  normalizeTarget,
  saveTarget,
  selectTargets,
} from '../src/broadcast/targets.js';

const destination = {
  id: 'news',
  label: 'News channel',
  network: 'telegram',
  kind: 'channel',
  destination: '@news_channel',
};
const fixture = () =>
  withCausalWrites(createMemoryStore(), { actor: 'target-fixture' });

test('causal destination storage retains explicit and all-enabled selections', async () => {
  const store = fixture();
  const saved = await saveTarget(store, destination);
  assert((await store.get(saved.id)).vc['target-fixture'] > 0);
  const expected = [
    { ...normalizeTarget(destination), version: saved.version },
  ];
  assert.deepEqual(
    await selectTargets(store, { targetIds: ['news'] }),
    expected
  );
  assert.deepEqual(await selectTargets(store, { all: true }), expected);
});

test('listed causal destinations can be edited without exposing storage metadata', async () => {
  const store = fixture();
  const saved = await saveTarget(store, destination);
  const [listed] = await listTargets(store);
  assert.deepEqual(listed, saved);
  assert.equal(Object.hasOwn(listed, 'vc'), false);
  assert.equal(Object.hasOwn(listed, SYNC_STAMP), false);
  const edited = await saveTarget(store, { ...listed, label: 'Updated news' });
  assert.equal(edited.label, 'Updated news');
  assert.notEqual(edited.version, saved.version);
});

test('replicated destination assignments retain their version and routing', async () => {
  const store = fixture();
  const saved = await saveTarget(store, destination);
  const original = await store.get(saved.id);
  await createPeer(store).receive({
    type: 'put',
    link: { ...original, destination: '@remote_news', vc: { remote: 2 } },
  });
  assert((await store.get(saved.id))[SYNC_STAMP]);
  const [selected] = await selectTargets(store, { targetIds: ['news'] });
  assert.equal(selected.destination, '@remote_news');
  assert.equal(selected.version, saved.version);
  assert.equal(Object.hasOwn(selected, SYNC_STAMP), false);
});

test('owner input and unknown stored credential fields retain strict validation', async () => {
  const store = fixture();
  for (const extra of [
    { vc: {} },
    { [SYNC_STAMP]: {} },
    { botToken: 'fixture-only' },
  ]) {
    await assert.rejects(saveTarget(store, { ...destination, ...extra }), {
      code: 'bad-target',
    });
  }
  const saved = await saveTarget(store, destination);
  await store.put({ ...saved, botToken: 'fixture-only' });
  await assert.rejects(selectTargets(store, { targetIds: ['news'] }), {
    code: 'bad-target',
  });
});
