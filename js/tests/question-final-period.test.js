import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';

const question = 'Where do you live?';
const plan = (answers, policy = {}) =>
  planAnswer(question, {
    rules: [{ id: 'qa-rule:period', question, answers }],
    policy,
  });
const variant = (text, count = 1, approved = true) => ({
  text,
  count,
  approved,
});

test('observed final-period pairs combine actual counts and prefer the period in either order', () => {
  for (const answers of [
    [variant('Vietnam', 4), variant('Vietnam.', 1)],
    [variant('Vietnam.', 1), variant('Vietnam', 4)],
  ]) {
    const before = globalThis.structuredClone(answers);
    const result = plan(answers);
    assert.equal(result.text, 'Vietnam.');
    assert.equal(result.count, 5);
    assert.equal(result.requiresReview, false);
    assert.deepEqual(answers, before, 'planning never edits observations');
    const without = plan(answers, { answerFinalPeriod: 'without' });
    assert.equal(without.text, 'Vietnam');
    assert.equal(without.count, 5);
  }
});

test('final-period preference never invents punctuation or conflates other spellings', () => {
  for (const text of ['Vietnam', 'Vietnam.']) {
    for (const answerFinalPeriod of ['with', 'without']) {
      assert.equal(plan([variant(text)], { answerFinalPeriod }).text, text);
    }
  }
  for (const [first, second] of [
    ['Vietnam', 'Vietnam...'],
    ['Vietnam', 'Vietnam!'],
    ['Vietnam', 'vietnam.'],
    ['Vietnam?', 'Vietnam?.'],
    ['Vietnam!', 'Vietnam!.'],
    ['Vietnam…', 'Vietnam….'],
    ['Vietnam', 'Vietnam。'],
  ]) {
    const result = plan([variant(first, 2), variant(second)]);
    assert.equal(result.text, first);
    assert.equal(result.count, 2);
    assert.equal(result.alternatives.length, 2);
  }
});

test('period pairs cannot transfer approval, canonical intent or question scope', () => {
  const result = plan([variant('Vietnam', 4, false), variant('Vietnam.', 1)]);
  assert.equal(result.text, 'Vietnam.');
  assert.equal(result.count, 1);
  assert.equal(plan([variant('Vietnam'), variant('Vietnam.', 0)]).count, 1);
  const scoped = planAnswer(question, {
    rules: [
      { id: 'qa-rule:one', question, answers: [variant('Vietnam', 4)] },
      { id: 'qa-rule:two', question, answers: [variant('Vietnam.', 1)] },
    ],
  });
  assert.equal(scoped.count, 5);
  assert.equal(scoped.text, 'Vietnam.');
  for (const other of ['Where is the office?', 'Where do you live now?']) {
    const separate = planAnswer(question, {
      rules: [
        { id: 'qa-rule:one', question, answers: [variant('Vietnam', 4)] },
        {
          id: 'qa-rule:two',
          question: other,
          answers: [variant('Vietnam.', 99)],
        },
      ],
    });
    assert.equal(separate.count, 4);
    assert.equal(separate.text, 'Vietnam');
  }
  const canonical = plan([
    variant('Vietnam', 4),
    { ...variant('Vietnam.', 0), canonical: true },
  ]);
  assert.equal(canonical.count, 0);
});
