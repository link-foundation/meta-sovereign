import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';

const rule = {
  id: 'qa-rule:experience',
  question: 'Recent experience',
  answers: [{ text: 'JavaScript and Rust', approved: true, count: 3 }],
};

test('an explicit form label can use a saved answer without changing chat recognition', () => {
  assert.equal(
    planAnswer(rule.question, { rules: [rule] }).match,
    'unanswered'
  );
  const answer = planAnswer(rule.question, {
    rules: [rule],
    questionMode: 'field',
  });
  assert.equal(answer.text, 'JavaScript and Rust');
  assert.equal(answer.match, 'exact');
  assert.equal(answer.similarity, 1);
});

test('form mode still respects rejected wording and incomplete substitutions', () => {
  assert.equal(
    planAnswer(rule.question, {
      rules: [rule],
      questionMode: 'field',
      policy: { rejected: ['Rust'] },
    }).match,
    'unanswered'
  );
  const incomplete = planAnswer(rule.question, {
    rules: [{ ...rule, answers: [{ text: '{{experience}}', approved: true }] }],
    questionMode: 'field',
  });
  assert.equal(incomplete.complete, false);
  assert.deepEqual(incomplete.missing, ['experience']);
});
