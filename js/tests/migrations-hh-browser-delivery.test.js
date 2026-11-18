import test from 'node:test';
import assert from 'node:assert/strict';
import * as migration from '../src/storage/migrations/0021-hh-browser-delivery.js';
import { runMigrations } from '../src/storage/migrations/core.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { learnArchivedAnswers } from '../src/automation/question-archive.js';
import { archiveBrowserHistoryWindow } from '../src/sources/browser-history-archive.js';

const messages = () =>
  [
    { id: '101', body: 'Which language do you use?', outgoing: false },
    { id: '102', body: 'TypeScript.', outgoing: true },
  ].map((row, index) => ({
    ...row,
    timestamp: `2026-11-11T10:00:0${index}Z`,
  }));
const fixture = async () => {
  const store = createMemoryStore();
  await archiveBrowserHistoryWindow(store, {
    source: 'hh',
    chat: '7',
    rows: messages(),
  });
  const answer = await store.get('msg:hh:7:102');
  await store.putMany([
    { ...answer, id: 'msg:hh:api', via: 'api' },
    { ...answer, id: 'msg:vk:7:102', source: 'vk' },
    { ...answer, id: 'msg:hh:sent', delivery: 'sent' },
    { ...answer, id: 'msg:hh:failed', delivery: 'failed' },
    { id: 'message-version:old', kind: 'message-version', snapshot: answer },
  ]);
  return store;
};
const run = (store, options) =>
  runMigrations(store, {
    migrations: [migration],
    from: 20,
    ...options,
  });

test('read-only legacy browser history also withholds unproven delivery without migration', async () => {
  const store = createMemoryStore();
  await archiveBrowserHistoryWindow(store, {
    source: 'hh',
    chat: '7',
    rows: messages(),
  });
  const before = await store.query();
  assert.equal((await learnArchivedAnswers(store)).rules.length, 0);
  assert.deepEqual(await store.query(), before);
});

test('0021 withholds unproven legacy browser answers until a positive native re-read', async () => {
  const store = await fixture();
  const before = await store.query();
  assert.equal((await run(store)).steps[0].changed, 1);
  assert.equal((await store.get('msg:hh:7:102')).delivery, 'unknown');
  for (const link of before.filter((row) => row.id !== 'msg:hh:7:102')) {
    assert.deepEqual(await store.get(link.id), link);
  }
  // Isolate the actual chat from unrelated metadata fixtures.
  for (const id of ['msg:hh:api', 'msg:hh:sent', 'msg:hh:failed']) {
    await store.delete(id);
  }
  assert.equal((await learnArchivedAnswers(store)).rules.length, 0);
  const rows = messages();
  rows[1].delivery = 'delivered';
  await archiveBrowserHistoryWindow(store, { source: 'hh', chat: '7', rows });
  assert.equal(
    (await learnArchivedAnswers(store)).rules[0].answers[0].text,
    'TypeScript.'
  );
});

test('0021 dry run counts without writes and is idempotent', async () => {
  const store = await fixture();
  const before = await store.query();
  assert.equal((await run(store, { dryRun: true })).steps[0].changed, 1);
  assert.deepEqual(await store.query(), before);
  await run(store);
  assert.equal((await run(store)).steps[0].changed, 0);
});
