import test from 'node:test';
import assert from 'node:assert/strict';
import * as migration from '../src/storage/migrations/0010-hh-message-metadata.js';
import { runMigrations } from '../src/storage/migrations/core.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { hhHistoryFixture } from '../../experiments/issue-56/hh-history-fixture.mjs';
import { hhSource } from '../src/sources/hh.js';

const oldStore = async () => {
  const store = createMemoryStore();
  const current = await hhSource.parseArchive(hhHistoryFixture());
  const old = current.map(({ outgoing: _out, service: _service, ...link }) => ({
    ...link,
    sender: 'unknown',
    children: link.children.map((id) =>
      id.startsWith('sender:hh:') ? 'sender:hh:unknown' : id
    ),
  }));
  delete old[0].raw;
  old[1].raw = { ...old[1].raw, reply_to: { id: '56001' } };
  await store.putMany([
    ...old,
    {
      id: 'message-version:old',
      kind: 'message-version',
      snapshot: old[3],
    },
  ]);
  return store;
};
const run = (store, options = {}) =>
  runMigrations(store, {
    migrations: [migration],
    from: 9,
    ...options,
  });

test('0010 recovers only saved HH evidence while preserving unrecoverable records and versions', async () => {
  const store = await oldStore();
  const unknown = await store.get('msg:hh:56001');
  const version = await store.get('message-version:old');
  const result = await run(store);
  assert.equal(result.steps[0].changed, 3);
  const answer = await store.get('msg:hh:56002');
  assert.equal(answer.outgoing, true);
  assert.equal(answer.sender, 'applicant');
  assert.equal(answer.replyTo, 'msg:hh:56001');
  assert.ok(answer.children.includes('sender:hh:applicant'));
  assert.ok(answer.children.includes('replyto:hh:msg:hh:56001'));
  assert.equal((await store.get('msg:hh:56004')).service, true);
  assert.deepEqual(await store.get('msg:hh:56001'), unknown);
  assert.deepEqual(await store.get('message-version:old'), version);
});

test('0010 dry run counts without writes and repeated execution changes nothing', async () => {
  const store = await oldStore();
  const before = await store.query();
  assert.equal((await run(store, { dryRun: true })).steps[0].changed, 3);
  assert.deepEqual(await store.query(), before);
  await run(store);
  assert.equal((await run(store)).steps[0].changed, 0);
});

test('0010 preserves explicit existing direction, sender and reply metadata', async () => {
  const store = await oldStore();
  const link = await store.get('msg:hh:56002');
  await store.put({
    ...link,
    outgoing: false,
    sender: 'saved-owner',
    replyTo: 'msg:hh:actual',
  });
  await run(store);
  const next = await store.get(link.id);
  assert.equal(next.outgoing, false);
  assert.equal(next.sender, 'saved-owner');
  assert.equal(next.replyTo, 'msg:hh:actual');
});
