import assert from 'node:assert/strict';
import { createMemoryStore } from '../../src/storage/universal.js';
import { assertQuestionPreviewSurfaces } from './question-surfaces.mjs';

/** Exercise persisted salary settings without changing rules or observations. */
export const assertStoredSalaryPreviews = async ({
  salary,
  question,
  options,
  rules = [],
  id,
  verify,
}) => {
  const store = createMemoryStore();
  for (const rule of rules) {
    await store.put(rule);
  }
  await store.put({
    id: `automation:${id}`,
    tokens: ['automation'],
    enabled: true,
    action: { kind: 'answer-questions', salary },
  });
  const before = JSON.stringify(await store.query(() => true));
  await assertQuestionPreviewSurfaces({
    store,
    automationId: id,
    input: { question, salary, ...(options ? { options } : {}) },
    verify,
  });
  assert.equal(JSON.stringify(await store.query(() => true)), before);
};
