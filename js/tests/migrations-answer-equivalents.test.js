import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  runMigrations,
  schemaLink,
  SCHEMA_ID,
} from '../src/storage/migrations/core.js';
import * as migration from '../src/storage/migrations/0024-answer-equivalents.js';
import {
  wordingRule,
  wordingMessages,
} from '../../experiments/issue-56/answer-equivalents-fixture.mjs';

test('wording migration admits explicit aliases and leaves legacy rules, counts and messages unchanged', async (t) => {
  const store = createMemoryStore();
  t.after(() => store.close?.());
  const declared = wordingRule();
  const legacy = {
    id: 'qa-rule:legacy',
    question: 'Location?',
    answers: [{ text: 'Hanoi', count: 3 }],
  };
  const originals = [declared, legacy, ...wordingMessages()];
  await store.putMany([schemaLink({ version: migration.from }), ...originals]);
  const preview = await runMigrations(store, {
    migrations: [migration],
    dryRun: true,
  });
  assert.equal(preview.steps[0].changed, 0);
  assert.equal((await store.get(SCHEMA_ID)).version, migration.from);
  await runMigrations(store, { migrations: [migration] });
  for (const original of originals) {
    assert.deepEqual(await store.get(original.id), original);
  }
  const once = await store.query();
  await runMigrations(store, { migrations: [migration] });
  assert.deepEqual(await store.query(), once);
});

test('wording migration refuses invalid declarations without advancing schema or exposing their contents', async (t) => {
  const store = createMemoryStore();
  t.after(() => store.close?.());
  const invalid = wordingRule();
  invalid.answers[0].equivalents = ['private-invalid', false];
  await store.putMany([schemaLink({ version: migration.from }), invalid]);
  await assert.rejects(
    runMigrations(store, { migrations: [migration] }),
    (error) =>
      error.cause?.code === 'ANSWER_EQUIVALENTS_COLLISION' &&
      !error.cause.message.includes('private-invalid')
  );
  assert.equal((await store.get(SCHEMA_ID)).version, migration.from);
  assert.deepEqual(await store.get(invalid.id), invalid);
});
