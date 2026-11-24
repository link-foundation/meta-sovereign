import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  runMigrations,
  schemaLink,
  SCHEMA_ID,
} from '../src/storage/migrations/core.js';
import * as migration from '../src/storage/migrations/0023-answer-final-period.js';

test('final-period migration counts a dry run, preserves observations and is idempotent', async () => {
  const store = createMemoryStore();
  const policy = {
    id: 'qa-policy:reuse',
    rejected: ['Keep rejected'],
    punctuationEquivalent: true,
  };
  const rule = {
    id: 'qa-rule:legacy',
    question: 'Location?',
    answers: [
      { text: 'Vietnam', count: 2 },
      { text: 'Vietnam.', count: 1 },
    ],
  };
  try {
    await store.putMany([
      schemaLink({ version: migration.from }),
      policy,
      rule,
    ]);
    const preview = await runMigrations(store, {
      migrations: [migration],
      dryRun: true,
    });
    assert.equal(preview.steps[0].changed, 1);
    assert.deepEqual(await store.get(policy.id), policy);
    assert.equal((await store.get(SCHEMA_ID)).version, migration.from);
    await runMigrations(store, { migrations: [migration] });
    assert.deepEqual(await store.get(policy.id), {
      ...policy,
      answerFinalPeriod: 'with',
    });
    assert.deepEqual(await store.get(rule.id), rule);
    const before = await store.query();
    await runMigrations(store, { migrations: [migration] });
    assert.deepEqual(await store.query(), before);
  } finally {
    await store.close?.();
  }
});

test('final-period migration preserves explicit preference and refuses invalid saved settings', async () => {
  for (const answerFinalPeriod of ['without', 'invalid']) {
    const store = createMemoryStore();
    const policy = { id: 'qa-policy:reuse', answerFinalPeriod };
    try {
      await store.putMany([schemaLink({ version: migration.from }), policy]);
      const run = () => runMigrations(store, { migrations: [migration] });
      if (answerFinalPeriod === 'invalid') {
        await assert.rejects(
          run,
          (error) => error.cause?.code === 'ANSWER_FINAL_PERIOD_COLLISION'
        );
        assert.equal((await store.get(SCHEMA_ID)).version, migration.from);
      } else {
        await run();
      }
      assert.deepEqual(await store.get(policy.id), policy);
    } finally {
      await store.close?.();
    }
  }
});
