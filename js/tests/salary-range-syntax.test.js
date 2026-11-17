import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { normalizeAutomation } from '../src/automation/automations.js';
import { assertQuestionPreviewSurfaces } from './helpers/question-surfaces.mjs';
import {
  salaryOptionConfig as salary,
  salaryBothQuestion as question,
} from '../../experiments/issue-56/salary-option-fixture.mjs';

test('salary alternatives and unrelated numeric labels never become intervals', () => {
  for (const choice of [
    'USD 5000 or 8000',
    'USD 5000 and 8000',
    'USD 5000 / 8000',
    'USD 5000 + 8000',
    'USD 5000 либо 8000',
    'USD 5000 или 8000',
    'USD 5000, bonus 8000',
    'USD 5000 before tax, 8000 after tax',
  ]) {
    for (const [prompt, questionMode] of [
      [question, 'chat'],
      [question, 'field'],
      ['What salary in USD net do you expect?', 'chat'],
      ['What salary in USD net do you expect?', 'field'],
    ]) {
      const result = planAnswer(prompt, {
        salary,
        options: [choice],
        questionMode,
      });
      assert.equal(result.text, '', choice);
      assert.equal(result.complete, false, choice);
      assert.equal(result.requiresReview, true, choice);
    }
  }
});

test('explicit salary intervals preserve currencies, scales and range connectors', () => {
  for (const choice of [
    'USD 5000–8000',
    '$5000—$8000',
    'USD 5k - USD 8k',
    'from 5000 USD to 8000 USD',
    'between USD 5000 and USD 8000',
    'от 5000 USD до 8000 USD',
    'между 5000 USD и 8000 USD',
    'USD 5000–8000 net and gross',
  ]) {
    const result = planAnswer(question, { salary, options: [choice] });
    assert.equal(result.text, choice);
    assert.equal(result.requiresReview, false);
  }
});

test('invalid numeric alternatives cannot compete with a valid current salary band', () => {
  const valid = 'USD 5000–8000';
  for (const questionMode of ['chat', 'field']) {
    const result = planAnswer(question, {
      salary,
      options: ['USD 5000 or 8000', valid],
      questionMode,
    });
    assert.equal(result.text, valid);
    assert.equal(result.complete, true);
    assert.equal(result.salary.option.contained, true);
  }
});

test(
  'salary range syntax holds survive CLI, offline and both Lino preview formats',
  { timeout: 15000 },
  async () => {
    const store = createMemoryStore();
    await store.put(
      normalizeAutomation({
        id: 'salary-range-syntax',
        action: { kind: 'answer-questions', salary },
      })
    );
    const before = JSON.stringify(await store.query(() => true));
    await assertQuestionPreviewSurfaces({
      store,
      automationId: 'salary-range-syntax',
      input: { question, salary, options: ['USD 5000 or 8000'] },
      verify(answer) {
        assert.equal(answer.text, '');
        assert.equal(answer.complete, false);
        assert.equal(answer.requiresReview, true);
      },
    });
    assert.equal(JSON.stringify(await store.query(() => true)), before);
  }
);
