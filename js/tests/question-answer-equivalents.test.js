import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planAnswer,
  normalizeAnswerRule,
} from '../src/automation/question-answers.js';

import {
  question,
  preferred,
  aliases,
} from '../../experiments/issue-56/answer-equivalents-fixture.mjs';
const rule = (id, answers, extra = {}) => ({
  id: `qa-rule:${id}`,
  question,
  answers,
  ...extra,
});
const declaration = (extra = {}) => ({
  text: preferred,
  count: 0,
  approved: true,
  equivalents: aliases,
  ...extra,
});

test('declared equivalent wording combines observed counts without inventing sends or editing variants', () => {
  const rules = [
    rule('wording', [
      declaration(),
      { text: aliases[0], count: 2, evidence: ['a1', 'a2'] },
      { text: aliases[1], count: 3, evidence: ['b1', 'b2', 'b3'] },
    ]),
  ];
  const before = globalThis.structuredClone(rules);
  const result = planAnswer(question, { rules });
  assert.equal(result.text, preferred);
  assert.equal(result.count, 5);
  assert.equal(result.requiresReview, false);
  assert.equal(result.alternatives.length, 1);
  assert.deepEqual(result.evidence, ['a1', 'a2', 'b1', 'b2', 'b3']);
  assert.deepEqual(rules, before);
  assert.deepEqual(
    normalizeAnswerRule(rules[0]).answers[0].equivalents,
    aliases
  );
});

test('wording declarations apply to exact eligible questions across learned rules, retaining other commitments and scopes', () => {
  const rules = [
    rule('preference', [declaration()]),
    rule('learned', [
      { text: aliases[0], count: 4 },
      { text: 'In a month.', count: 2 },
    ]),
    rule('other-question', [{ text: aliases[0], count: 90 }], {
      question: 'How long will the project take?',
    }),
    rule('other-source', [{ text: aliases[0], count: 70 }], {
      sources: ['vk'],
    }),
  ];
  const result = planAnswer(question, { rules, source: 'hh' });
  assert.equal(result.text, preferred);
  assert.equal(result.count, 4);
  assert.ok(
    result.alternatives.some((answer) => answer.text === 'In a month.')
  );
  const unrelated = planAnswer('How long will the project take?', {
    rules,
    source: 'hh',
  });
  assert.equal(unrelated.text, aliases[0]);
  assert.equal(unrelated.count, 90);
  assert.equal(
    planAnswer(question, {
      rules: [
        rule('unapproved', [
          declaration({ approved: false }),
          { text: aliases[0], count: 2 },
        ]),
      ],
    }).requiresReview,
    true
  );
});

test('ambiguous wording preferences and overlapping observations always require review', () => {
  const ambiguous = planAnswer(question, {
    rules: [
      rule('one', [declaration({ count: 9 })]),
      rule('two', [
        declaration({ text: 'A different approved wording.', count: 1 }),
      ]),
      rule('observed', [{ text: aliases[0], count: 2 }]),
    ],
  });
  assert.equal(ambiguous.requiresReview, true);
  const duplicate = planAnswer(question, {
    rules: [
      rule('preference', [declaration()]),
      rule('a', [
        { text: aliases[0], count: 1, evidence: ['same-observation'] },
      ]),
      rule('b', [
        { text: aliases[1], count: 1, evidence: ['same-observation'] },
      ]),
    ],
  });
  assert.equal(duplicate.requiresReview, true);
  assert.notEqual(duplicate.count, 2, 'overlapping evidence cannot be summed');
});

test('wording declarations validate finite unambiguous literal lists and preserve rejection policy', () => {
  for (const equivalents of [
    true,
    [''],
    ['x'.repeat(12001)],
    Array(101).fill('same'),
  ]) {
    assert.throws(() =>
      normalizeAnswerRule(rule('bad', [declaration({ equivalents })]))
    );
  }
  assert.throws(() =>
    normalizeAnswerRule(
      rule('conflict', [declaration(), declaration({ text: 'Different.' })])
    )
  );
  assert.throws(() =>
    normalizeAnswerRule(
      rule('chain', [
        declaration({ equivalents: ['Next.'] }),
        declaration({ text: 'Next.', equivalents: ['Third.'] }),
      ])
    )
  );
  const result = planAnswer(question, {
    rules: [rule('rejected', [declaration(), { text: aliases[0], count: 8 }])],
    policy: { rejected: [aliases[0]] },
  });
  assert.equal(result.count, 0);
});
