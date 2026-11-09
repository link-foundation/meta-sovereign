// Offline archive learning: no credentials, browsers or sends.
import assert from 'node:assert/strict';
import { createMemoryStore } from '../js/src/storage/universal.js';
import { learnSavedAnswers } from '../js/src/automation/question-store.js';
import { encodeLinoValue } from '../js/src/transport/lino.js';

const store = createMemoryStore();
for (const source of ['hh', 'telegram']) {
  for (const [id, sender, body] of [
    [1, 'interviewer', 'Where do you live?'],
    [2, 'me', 'Vietnam.'],
  ]) {
    await store.put({
      id: `msg:${source}:1:${id}`,
      source,
      chat: '1',
      sender,
      body,
      timestamp: `2026-11-09T10:00:0${id}Z`,
    });
  }
}
const preview = await learnSavedAnswers(store);
assert.equal(preview.coverage.scope, 'archive');
assert.equal(preview.rules[0].answers[0].count, 2);
const applied = await learnSavedAnswers(store, { apply: true });
assert.equal(applied.rules[0].answers[0].approved, false);
const repeated = await learnSavedAnswers(store, { apply: true });
assert.equal(repeated.rules[0].answers[0].count, 2);
console.log(
  encodeLinoValue({ coverage: repeated.coverage, rules: repeated.rules })
);
