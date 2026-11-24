import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  runMigrations,
  schemaLink,
  SCHEMA_ID,
} from '../src/storage/migrations/core.js';
import * as migration from '../src/storage/migrations/0022-unread-answers.js';

const row = {
  id: 'question-unread:legacy',
  kind: 'question-unread',
  state: 'completed',
  entries: [{ chat: '8', preview: 'Preserved review' }],
};
const polling = {
  id: 'question-unread:polling:legacy',
  kind: 'question-unread-polling',
  state: 'paused',
  input: { noticeReplies: true },
  entries: [],
};

test('unread migration preserves old receipts and never enables answering or resumes polling', async () => {
  const store = createMemoryStore();
  try {
    await store.putMany([
      schemaLink({ version: migration.from }),
      row,
      polling,
      { id: 'outbox:unchanged', status: 'unknown', text: 'Keep unchanged' },
    ]);
    await runMigrations(store, { migrations: [migration], dryRun: true });
    assert.deepEqual(await store.get(row.id), row);
    assert.equal((await store.get(SCHEMA_ID)).version, migration.from);
    await runMigrations(store, { migrations: [migration] });
    assert.deepEqual(await store.get(row.id), { ...row, answerChats: false });
    assert.deepEqual(await store.get(polling.id), {
      ...polling,
      answerChats: false,
      input: { ...polling.input, answerChats: false },
    });
    assert.equal((await store.get('outbox:unchanged')).status, 'unknown');
    const before = await store.query();
    await runMigrations(store, { migrations: [migration] });
    assert.deepEqual(await store.query(), before);
  } finally {
    await store.close?.();
  }
});

test('unread migration refuses malformed saved intent and preserves explicit new intent', async () => {
  for (const patch of [
    { answerChats: 'true' },
    { input: { answerChats: 1 } },
  ]) {
    const store = createMemoryStore();
    try {
      const malformed = { ...row, ...patch };
      await store.putMany([schemaLink({ version: migration.from }), malformed]);
      await assert.rejects(
        runMigrations(store, { migrations: [migration] }),
        (error) => error.cause?.code === 'UNREAD_ANSWERS_COLLISION'
      );
      assert.deepEqual(await store.get(row.id), malformed);
      assert.equal((await store.get(SCHEMA_ID)).version, migration.from);
    } finally {
      await store.close?.();
    }
  }
  const store = createMemoryStore();
  try {
    const enabled = {
      ...polling,
      answerChats: true,
      input: { answerChats: true },
    };
    await store.putMany([schemaLink({ version: migration.from }), enabled]);
    await runMigrations(store, { migrations: [migration] });
    assert.deepEqual(await store.get(enabled.id), enabled);
  } finally {
    await store.close?.();
  }
});
