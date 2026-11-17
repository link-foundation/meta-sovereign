import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assertQuestionPreviewSurfaces } from './helpers/question-surfaces.mjs';
import {
  wordingSalary as salary,
  salaryWordingQuestion as question,
  salaryWordingTemplate as template,
  salaryWordingExpected as expected,
  salaryWordingRule as rule,
} from '../../experiments/issue-56/salary-wording-fixture.mjs';

test('salary inference reuses approved owner wording with current independent currency amounts', () => {
  const rules = [rule()];
  const before = JSON.parse(JSON.stringify(rules));
  const result = planAnswer(question, { salary, rules });
  assert.equal(result.text, expected);
  assert.equal(result.match, 'salary');
  assert.equal(result.salary.currency, 'EUR');
  assert.deepEqual(result.rules, [rules[0].id]);
  assert.equal(result.requiresReview, false);
  assert.deepEqual(rules, before);
  const current = {
    ...salary,
    currencies: salary.currencies.map((entry) =>
      entry.code === 'EUR' ? { ...entry, net: 5700 } : entry
    ),
  };
  assert.equal(
    planAnswer(question, { salary: current, rules }).text,
    'От 5 700 € ежемесячно на руки.'
  );
});

test('exact salary questions retain their approved wording before richer inferred alternatives', () => {
  const exact = rule({
    question,
    answers: [{ text: 'От {{salary_net}}.', approved: true, count: 3 }],
  });
  const result = planAnswer(question, {
    salary,
    rules: [exact, rule({ id: 'qa-rule:richer' })],
  });
  assert.equal(result.text, 'От 5 500 €.');
  assert.deepEqual(result.rules, [exact.id]);
  const corrected = rule({
    question,
    answers: [
      { text: template, approved: true, canonical: true, count: 1 },
      { text: 'От {{salary_net}} в месяц на руки.', approved: true, count: 99 },
    ],
  });
  assert.equal(
    planAnswer(question, { salary, rules: [corrected] }).text,
    expected
  );
});

test('learned salary wording is deterministic, detailed and isolated by language, basis and period', () => {
  const rules = [
    rule(),
    rule({
      id: 'qa-rule:salary-wording-2',
      question: 'Зарплатные ожидания?',
      answers: [{ text: 'От {{salary_net}} в месяц на руки.', approved: true }],
    }),
    rule({
      id: 'qa-rule:salary-wording-short',
      answers: [{ text: 'От {{salary_net}}.', approved: true }],
    }),
  ];
  const choices = new Set();
  for (const label of [
    'Какую зарплату в EUR вы ожидаете?',
    'Какая ваша ожидаемая зарплата в EUR?',
    'Ожидаемая зарплата в EUR?',
    'Зарплата в EUR?',
    'Ваши финансовые ожидания в EUR?',
  ]) {
    const input = { salary, rules };
    const text = planAnswer(label, input).text;
    assert.equal(planAnswer(label, input).text, text);
    assert.ok([expected, 'От 5 500 € в месяц на руки.'].includes(text));
    choices.add(text);
  }
  assert.equal(choices.size, 2);
  assert.equal(
    planAnswer('What salary in EUR do you expect?', { salary, rules }).text,
    'From 5 500 € net per month.'
  );
  assert.equal(
    planAnswer('What hourly rate in EUR do you expect?', { salary, rules })
      .text,
    'From 35 € net per hour.'
  );
  assert.equal(
    planAnswer('Зарплата в EUR до вычета налогов?', { salary, rules }).text,
    'От 6 500 € в месяц до вычета налогов.'
  );
});

test('exact salary frequency and compatible approved wording survive policy filtering', () => {
  const alternatives = rule({
    question,
    answers: [
      { text: 'От {{salary_net}}.', approved: true, count: 1 },
      { text: template, approved: true, count: 12 },
    ],
  });
  assert.equal(
    planAnswer(question, { salary, rules: [alternatives] }).text,
    expected
  );
  assert.equal(
    planAnswer(question, {
      salary,
      rules: [rule()],
      policy: { rejected: ['в месяц'] },
    }).text,
    expected
  );
  const gross = rule({
    id: 'qa-rule:gross-wording',
    question: 'Ожидания по зарплате gross?',
    answers: [
      {
        text: 'От {{salary_gross}} ежемесячно до вычета {{salary_tax}} ({{salary_net}} на руки).',
        approved: true,
      },
    ],
  });
  const result = planAnswer('Зарплата в EUR до вычета налогов?', {
    salary,
    rules: [rule(), gross],
  });
  assert.equal(
    result.text,
    'От 6 500 € ежемесячно до вычета налогов (5 500 € на руки).'
  );
  assert.equal(result.requiresReview, false);
});

test('salary wording inference respects scope, canonical edits, rejection and owner explanations', () => {
  for (const candidate of [
    rule({ enabled: false }),
    rule({ sources: ['telegram'] }),
    rule({ chats: ['hh:other'] }),
    rule({ kind: 'notice' }),
    rule({ answers: [{ text: template, approved: false }] }),
  ]) {
    assert.notEqual(
      planAnswer(question, {
        salary,
        rules: [candidate],
        source: 'hh',
        chat: '7',
      }).text,
      expected
    );
  }
  const held = planAnswer(question, {
    salary: { ...salary, approved: false },
    rules: [rule()],
  });
  assert.equal(held.text, expected);
  assert.equal(held.requiresReview, true);
  assert.notEqual(
    planAnswer(question, {
      salary,
      rules: [rule()],
      policy: { rejected: ['ежемесячно'] },
    }).text,
    expected
  );
  assert.equal(
    planAnswer('What salary in EUR net do you expect?', {
      salary,
      rules: [
        rule({
          question: 'What salary in USD net do you expect?',
          answers: [
            { text: 'From {{salary_net}} gross per month.', approved: true },
          ],
        }),
      ],
    }).text,
    'From 5 500 € net per month.'
  );
  const detail = 'От {{salary_net}} на руки, потому что это мой опыт.';
  const detailed = planAnswer(question, {
    salary,
    rules: [rule({ question, answers: [{ text: detail, approved: true }] })],
  });
  assert.equal(detailed.text, 'От 5 500 € на руки, потому что это мой опыт.');
  assert.equal(detailed.requiresReview, false);
});

test('salary wording retains declared equivalents and the observed final-period preference', () => {
  const paired = rule({
    answers: [
      { text: template, approved: true, count: 2 },
      { text: template.slice(0, -1), approved: true, count: 3 },
    ],
  });
  assert.equal(
    planAnswer(question, {
      salary,
      rules: [paired],
      answerFinalPeriod: 'without',
    }).text,
    expected.slice(0, -1)
  );
  const preferred = 'От {{salary_net}} в месяц на руки.';
  const declared = rule({
    answers: [
      { text: preferred, equivalents: [template], approved: true, count: 1 },
      { text: template, approved: true, count: 99 },
    ],
  });
  assert.equal(
    planAnswer(question, { salary, rules: [declared] }).text,
    'От 5 500 € в месяц на руки.'
  );
});

test(
  'CLI, offline and both Lino previews reuse stored salary wording without rewriting counts',
  { timeout: 15000 },
  async () => {
    const store = createMemoryStore();
    await store.put(rule());
    const automationId = 'salary-wording';
    await store.put({
      id: `automation:${automationId}`,
      tokens: ['automation'],
      enabled: true,
      action: { kind: 'answer-questions', salary },
    });
    const before = JSON.stringify(await store.query(() => true));
    await assertQuestionPreviewSurfaces({
      store,
      automationId,
      input: { question, salary },
      verify(answer) {
        assert.equal(answer.text, expected);
        assert.equal(answer.salary.currency, 'EUR');
      },
    });
    assert.equal(JSON.stringify(await store.query(() => true)), before);
  }
);
