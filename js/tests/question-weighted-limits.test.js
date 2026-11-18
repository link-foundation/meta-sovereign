import test from 'node:test';
import assert from 'node:assert/strict';
import {
  questionSimilarity,
  MAX_QUESTION_LENGTH,
} from '../src/automation/question-match.js';

const weighted = { algorithm: 'weighted' };

test('standalone weighted matching refuses oversized questions before admitting work', () => {
  const oversized = 'x'.repeat(MAX_QUESTION_LENGTH + 1);
  for (const [left, right] of [
    [oversized, 'xxxxx'],
    ['xxxxx', oversized],
    [undefined, 'xxxxx'],
    ['xxxxx', 123],
  ]) {
    const budget = { remaining: 1024 ** 2, exhausted: false };
    assert.equal(questionSimilarity(left, right, budget, weighted), 0);
    assert.deepEqual(budget, { remaining: 1024 ** 2, exhausted: false });
  }
});

test('standalone weighted matching retains the admitted length boundary and ordered behavior', () => {
  const boundary = 'x'.repeat(MAX_QUESTION_LENGTH);
  const budget = { remaining: 1024 ** 2, exhausted: false };
  const score = questionSimilarity(boundary, 'xxxxx', budget, weighted);
  assert.ok(score > 0 && score < 1);
  assert.equal(budget.remaining, 1024 ** 2 - MAX_QUESTION_LENGTH * 5);
  assert.equal(budget.exhausted, false);
  assert.equal(questionSimilarity('123', 123), 1);
});
