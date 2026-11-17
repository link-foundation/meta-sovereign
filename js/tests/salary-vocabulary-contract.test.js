import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';
import { createAutomationRunner } from '../src/automation/runner.js';
import { normalizeAutomation } from '../src/automation/automations.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assertStoredSalaryPreviews } from './helpers/salary-preview-surfaces.mjs';
import {
  vocabularySalary as salary,
  salaryVocabularyQuestion as question,
  salaryVocabularyRules,
  salaryVocabularyExpected as expected,
} from '../../experiments/issue-56/salary-vocabulary-fixture.mjs';

const salaryPlan = (question, rules, options = {}) =>
  planAnswer(question, { salary, rules, approximate: false, ...options });

test('salary intent and gross basis learn from three distinct approved owner questions', () => {
  const rules = salaryVocabularyRules();
  const before = JSON.stringify(rules);
  const result = salaryPlan(question, rules);
  assert.equal(result.match, 'salary');
  assert.equal(result.text, expected);
  assert.equal(result.salary.basis, 'gross');
  assert.equal(result.requiresReview, false);
  assert.equal(salaryPlan(question.replace('retainer ', ''), rules).text, '');
  assert.equal(JSON.stringify(rules), before);
  assert.equal(
    salaryPlan(
      question,
      rules.map((rule) => ({
        ...rule,
        question: rule.question.replace(/[.?]$/u, ' per month?'),
      }))
    ).text,
    expected
  );
  for (const source of ['hh', 'telegram', 'vk', 'email', 'linkedin']) {
    assert.equal(
      salaryPlan(question, rules, { source, chat: '7' }).text,
      expected
    );
  }
  assert.equal(
    salaryPlan(question.replace('EUR', 'USD'), rules).text,
    'From $7 100 gross per month.'
  );
});

test('salary vocabulary counts distinct questions, enforces purity and retains scope and corrections', () => {
  const rules = salaryVocabularyRules();
  assert.equal(salaryPlan(question, rules.slice(0, 2)).text, '');
  assert.equal(
    salaryPlan(question, [
      ...rules,
      ...Array.from({ length: 998 }, (_, index) => ({
        id: `qa-rule:bounded-${index}`,
        question: `Unrelated example ${index}?`,
        answers: [{ text: 'Yes', approved: true }],
      })),
    ]).text,
    ''
  );
  assert.equal(
    salaryPlan(question, [
      rules[0],
      { ...rules[0], id: 'qa-rule:copy' },
      rules[1],
    ]).text,
    ''
  );
  for (const override of [
    { enabled: false },
    { sources: ['telegram'] },
    { chats: ['hh:other'] },
    { kind: 'notice' },
    { answers: [{ text: 'From {{salary_gross}}.', approved: false }] },
    {
      answers: [
        { text: 'From {{salary_net_hourly}} per hour.', approved: true },
      ],
    },
  ]) {
    assert.equal(
      salaryPlan(
        question,
        rules.map((rule) => ({ ...rule, ...override })),
        { source: 'hh', chat: '7' }
      ).text,
      ''
    );
  }
  const unrelated = {
    id: 'qa-rule:other',
    question: 'Does your package retainer include support?',
    answers: [{ text: 'Yes', approved: true }],
  };
  assert.equal(salaryPlan(question, [...rules, unrelated]).text, '');
  const nine = Array.from({ length: 9 }, (_, index) => ({
    ...rules[index % 3],
    id: `qa-rule:nine-${index}`,
    question: `Package retainer preference variant ${index}?`,
  }));
  assert.equal(salaryPlan(question, [...nine, unrelated]).text, expected);
  const canonical = rules.map((rule) => ({
    ...rule,
    answers: [
      ...rule.answers,
      { text: 'No disclosure', canonical: true, approved: true },
    ],
  }));
  assert.equal(salaryPlan(question, canonical).text, '');
});

test('learned salary vocabulary inherits context but cannot override explicit basis or excluded topics', () => {
  const rules = salaryVocabularyRules();
  const input = { recent: [question] };
  assert.equal(
    salaryPlan('And in USD?', rules, input).text,
    'From $7 100 gross per month.'
  );
  assert.equal(
    salaryPlan('What package retainer net in EUR?', rules).text,
    'From 5 500 € net per month.'
  );
  assert.equal(
    salaryPlan('What package retainer gross and net in EUR?', rules).salary
      .basis,
    'both'
  );
  for (const excluded of [
    'What was your previous package retainer?',
    'What is your current package retainer?',
    'Would you accept this package retainer?',
    'What is the annual package retainer?',
    'How do you calculate the package retainer?',
  ]) {
    assert.equal(salaryPlan(excluded, rules).text, '', excluded);
  }
  assert.equal(
    salaryPlan('And in USD?', rules, {
      recent: ['What PostgreSQL version do you use?', question],
    }).text,
    ''
  );
  assert.equal(salaryPlan('And per hour in USD?', rules, input).text, '');
});

test('ordinary expected-pay labels and exclusion boundaries share salary planning', () => {
  for (const label of [
    'Ваш оклад?',
    'Ваши денежные пожелания?',
    'Ожидания по вознаграждению?',
    'Ожидания по з/п?',
    'Ваша ожидаемая компенсация?',
    'Комфортный уровень дохода?',
    'Rate expectations?',
    'What are your current salary expectations?',
    'Ваши текущие зарплатные ожидания?',
  ]) {
    assert.equal(salaryPlan(label, []).match, 'salary', label);
  }
  for (const label of [
    'Входит ли вилка до 210к на руки в ваши зарплатные ожидания?',
    'В каких подсистемах 1С работали? (продажи, склад, зарплата)',
    'Какая текущая зарплата?',
    'Вам подходит зарплата 200000?',
    'Как вы получаете выплату зарплаты?',
  ]) {
    assert.notEqual(salaryPlan(label, []).match, 'salary', label);
  }
});

test(
  'stored learned salary vocabulary reaches actual CLI, offline and both Lino formats',
  { timeout: 15000 },
  async () => {
    await assertStoredSalaryPreviews({
      id: 'salary-vocabulary',
      rules: salaryVocabularyRules(),
      salary,
      question,
      verify(answer) {
        assert.equal(answer.text, expected);
        assert.equal(answer.salary.basis, 'gross');
      },
    });
  }
);

test(
  'learned salary delivery rereads changed corpus before claiming an outbox',
  { timeout: 10000 },
  async () => {
    const store = createMemoryStore();
    const rules = salaryVocabularyRules();
    for (const rule of rules) {
      await store.put(rule);
    }
    const automation = normalizeAutomation({
      id: 'salary-vocabulary',
      action: { kind: 'answer-questions', salary, approximate: false },
      conditions: { mutual: false, cooldownDays: 0 },
      pacing: { typing: true },
    });
    await store.put(automation);
    await store.put({
      id: 'msg:hh:7:1',
      source: 'hh',
      chat: '7',
      sender: 'them',
      body: question,
      timestamp: '2026-11-17T01:00:00Z',
    });
    let sends = 0;
    const runner = createAutomationRunner({
      store,
      self: ['me'],
      sleep: async () => {
        await store.put({ ...rules[0], enabled: false });
      },
      send: async () => {
        sends++;
        return { status: 'sent' };
      },
    });
    const plan = await runner.plan(automation, {
      targets: [{ source: 'hh', chat: '7' }],
    });
    assert.equal(plan.drafts[0].text, expected);
    const outcome = await runner.deliverDraft(automation, plan.drafts[0]);
    assert.equal(outcome.code, 'answer-review-required');
    assert.equal(sends, 0);
    assert.deepEqual(
      await store.query((row) => row.id.startsWith('outbox:')),
      []
    );
  }
);
