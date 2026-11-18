import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { saveAnswerRule } from '../src/automation/question-store.js';
import { planFormAnswers } from '../src/forms/answer-plan.js';
import { exactApplicationPlan } from '../src/jobs/application-review.js';
import { continuationWrites } from '../src/jobs/application-continuation-fields.js';
import {
  formModelField,
  formModelInspection,
} from './helpers/forms-plan-inspection.mjs';

const question = 'Which editor do you use?';
const saved = (id, text, approved = false) => ({
  id,
  question,
  answers: [{ text, approved, count: 1 }],
});
const plannedApplication = async (t, rules) => {
  const store = createMemoryStore();
  t.after(() => store.close?.());
  for (const rule of rules) {
    await saveAnswerRule(store, rule);
  }
  const inspection = {
    ...formModelInspection([
      formModelField(question, { tag: 'textarea', index: 0 }),
    ]),
    navigation: { nextPage: false, limited: false },
  };
  const report = await planFormAnswers(store, {
    inspection,
    source: 'hh',
    approximate: false,
    modelDraft: false,
  });
  return {
    report,
    page: { scope: true, questions: true, fieldIndices: [0] },
    options: {},
  };
};

for (const [name, rules] of [
  ['unapproved exact answer', [saved('unapproved', 'Vim.')]],
  [
    'component of an approved whole questionnaire',
    [
      {
        ...saved('whole', '1. Vim.\n2. Helsinki.', true),
        question: `1. ${question}\n2. Where do you live?`,
      },
    ],
  ],
  [
    'conflicting approved answers',
    [saved('first', 'Vim.', true), saved('second', 'Emacs.', true)],
  ],
]) {
  test(
    `native automatic sending refuses ${name} even after the value matches`,
    { timeout: 4000 },
    async (t) => {
      const record = await plannedApplication(t, rules);
      const answer = record.report.fields[0].answer;
      assert.equal(answer.source, 'exact');
      assert.equal(answer.complete, true);
      record.report.fields[0].value = answer.proposal.value;
      assert.equal(exactApplicationPlan(record), false);
      assert.equal(answer.reuseRequiresReview, true);
      record.report.fields[0].value = '';
      assert.deepEqual(continuationWrites(record), []);
    }
  );
}

test(
  'an approved unambiguous exact answer remains eligible while missing admission evidence refuses',
  { timeout: 4000 },
  async (t) => {
    const record = await plannedApplication(t, [
      saved('approved', 'Vim.', true),
    ]);
    const answer = record.report.fields[0].answer;
    assert.equal(answer.requiresReview, true, 'form review remains explicit');
    assert.equal(answer.reuseRequiresReview, false);
    assert.equal(continuationWrites(record).length, 1);
    record.report.fields[0].value = 'Vim.';
    assert.equal(exactApplicationPlan(record), true);
    delete answer.reuseRequiresReview;
    record.report.fields[0].value = 'Vim.';
    assert.equal(exactApplicationPlan(record), false);
    record.report.fields[0].value = '';
    assert.deepEqual(continuationWrites(record), []);
  }
);
