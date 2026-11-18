import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { resolveAssignmentVacancy } from '../src/assignments/vacancy.js';
import { createAssignmentVacancyReader } from '../src/assignments/vacancy-reader.js';
import {
  vacancySnapshotFixture,
  vacancyUrl,
  fakeVacancySession,
} from '../../experiments/issue-56/vacancy-fixture.mjs';

test('vacancy reader retains visible employer metadata with the complete prose', async () => {
  const expected = vacancySnapshotFixture();
  const reader = createAssignmentVacancyReader({
    store: {},
    openSession: async () => fakeVacancySession(expected),
  });
  const actual = await reader(vacancyUrl);
  assert.equal(actual.description, expected.description);
  for (const key of [
    'salary',
    'location',
    'experience',
    'employment',
    'workFormat',
    'published',
  ]) {
    assert.equal(actual[key], expected[key]);
  }
});

test('incomplete vacancy refresh cannot replace a previously successful snapshot', async () => {
  const store = createMemoryStore();
  let snapshot = vacancySnapshotFixture();
  const context = {
    store,
    readVacancy: async () => snapshot,
    signal: new AbortController().signal,
  };
  const input = { vacancyUrl };
  const inspection = { url: 'https://example.test/task' };
  await resolveAssignmentVacancy(context, input, inspection);
  const saved = await store.query((row) =>
    row.id.startsWith('assignment-vacancy:')
  );
  snapshot = { ...snapshot, description: '' };
  await assert.rejects(
    resolveAssignmentVacancy(
      context,
      { ...input, refreshVacancy: true },
      inspection
    )
  );
  assert.deepEqual(
    await store.query((row) => row.id.startsWith('assignment-vacancy:')),
    saved
  );
});
