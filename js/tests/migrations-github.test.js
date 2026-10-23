// Migration 0004 (R-Z11, R-Z17): GitHub items get externalId and messageId
// from fields already stored. Fakes only.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as m0004 from '../src/storage/migrations/0004-github-external-ids.js';
import { runMigrations } from '../src/storage/migrations/core.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { requireRef } from '../src/sources/github-ref.js';

const gh = (externalId, extra = {}) => ({
  id: `msg:github:${externalId}`,
  tokens: ['message', 'github', externalId],
  source: 'github',
  sender: 'ann',
  body: 'b',
  timestamp: '2026-01-01T00:00:00Z',
  ...extra,
});

const oldStore = async () => {
  const store = createMemoryStore();
  await store.putMany([
    gh('issue:o/r#7', {
      chat: 'o/r#7',
      raw: {
        id: 1007,
        node_id: 'I_7',
        url: 'https://api.github.com/repos/o/r/issues/7',
      },
    }),
    gh('issue-comment:o/r#555', {
      chat: 'o/r#7',
      raw: { id: 555, node_id: 'IC_555', url: null },
    }),
    gh('review-comment:unknown#99', {
      chat: 'unknown',
      raw: {
        id: 99,
        url: 'https://api.github.com/repos/o/r/pulls/comments/99',
      },
    }),
    // Cannot be placed: no repository anywhere, no REST id.
    gh('issue:unknown#3', { chat: 'unknown#3', raw: {} }),
    gh('pr:12345', { raw: { id: 12345 } }),
    { id: 'msg:telegram:1', source: 'telegram' },
  ]);
  return store;
};

const run = (store, options = {}) =>
  runMigrations(store, { migrations: [m0004], from: 3, ...options });

test('0004 backfills externalId and messageId from the stored fields', async () => {
  const store = await oldStore();
  const result = await run(store);
  assert.equal(result.to, 4);
  const issue = await store.get('msg:github:issue:o/r#7');
  assert.deepEqual(issue.externalId, {
    network: 'github',
    kind: 'issue',
    id: 1007,
    nodeId: 'I_7',
    owner: 'o',
    repo: 'r',
    number: 7,
  });
  assert.equal(issue.messageId, '1007');
  const comment = await store.get('msg:github:issue-comment:o/r#555');
  assert.equal(comment.externalId.id, 555);
  assert.equal(comment.externalId.number, 7);
  const review = await store.get('msg:github:review-comment:unknown#99');
  assert.equal(review.externalId.repo, 'r', 'the repo comes from raw.url');
  assert.equal(review.messageId, '99');
  assert.equal(issue.body, 'b', 'nothing else changed');
  assert.equal((await store.get('msg:telegram:1')).externalId, undefined);
  assert.doesNotThrow(() => requireRef(comment, 'edit'));
});

test('0004 leaves what it cannot place refusing with no-external-id', async () => {
  const store = await oldStore();
  await run(store);
  for (const unplaced of [
    'msg:github:issue:unknown#3',
    'msg:github:pr:12345',
  ]) {
    const link = await store.get(unplaced);
    assert.equal(link.externalId, undefined);
    assert.throws(() => requireRef(link, 'edit'), { code: 'no-external-id' });
  }
});

test('0004 is idempotent: the second run changes nothing', async () => {
  const store = await oldStore();
  await run(store);
  const second = await run(store);
  assert.equal(second.steps[0].changed, 0);
});

test('0004 dry run counts and writes nothing', async () => {
  const store = await oldStore();
  const before = JSON.stringify(await store.query(() => true));
  const result = await run(store, { dryRun: true });
  assert.equal(result.steps[0].changed, 3);
  assert.equal(JSON.stringify(await store.query(() => true)), before);
});
