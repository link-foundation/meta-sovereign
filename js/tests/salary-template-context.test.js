import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';
import { assertStoredSalaryPreviews } from './helpers/salary-preview-surfaces.mjs';
import {
  contextSalary as salary,
  salaryTemplateQuestion as question,
  salaryTemplateExpected as expected,
  salaryTemplateRule as rule,
} from '../../experiments/issue-56/salary-template-context-fixture.mjs';

const answer = (template, options = {}) =>
  planAnswer(question, {
    salary,
    rules: [rule({ answers: [{ text: template, approved: true, count: 3 }] })],
    ...options,
  });

test('an approved personal salary template follows current requested currency without losing owner wording', () => {
  const rules = [rule()];
  const before = JSON.stringify(rules);
  for (const source of ['hh', 'linkedin', 'telegram', 'vk', 'x']) {
    const result = planAnswer(question, { salary, rules, source });
    assert.equal(result.text, expected, source);
    assert.equal(result.match, 'exact');
    assert.equal(result.requiresReview, false);
    assert.equal(result.salaryTemplates.contextMismatch, false);
    assert.equal(result.salaryTemplates.fields[0].currency, 'EUR');
  }
  assert.equal(JSON.stringify(rules), before);
  assert.equal(
    answer('От {{salary_net_usd}} на руки или эквивалент.').text,
    'От 5 500 € на руки или эквивалент.'
  );
});

test('personal salary placeholders follow vacancy context and never fall back to an available foreign target', () => {
  const label = 'What salary do you expect?';
  const rules = [rule({ question: label })];
  const result = planAnswer(label, {
    salary,
    rules,
    vacancy: { pay: 'EUR 5000–7000', description: 'Products sold in USD' },
  });
  assert.equal(result.text, expected);
  assert.equal(result.requiresReview, false);
  const missing = answer('I expect {{salary_gross_usd}}, negotiable.', {
    salary: {
      ...salary,
      currencies: salary.currencies.map((entry) =>
        entry.code === 'EUR'
          ? { code: 'EUR', keywords: ['EUR'], net: entry.net }
          : entry
      ),
    },
  });
  assert.equal(missing.complete, false);
  assert.equal(missing.requiresReview, true);
  assert.ok(!missing.text.includes('$7 100'));
});

test('tax wording keeps an explicit owner label and uses generic taxes outside its configured RUB context', () => {
  const text =
    'От {{salary_gross_usd}} ежемесячно до вычета {{salary_tax}} ({{salary_net_usd}} на руки).';
  const label = 'Какая ожидаемая зарплата в RUB gross?';
  const rules = [
    rule({ question: label, answers: [{ text, approved: true }] }),
  ];
  const profile = { salary_tax: 'НДФЛ' };
  const rub = planAnswer(label, { salary, rules, profile });
  assert.equal(
    rub.text,
    'От 530 000 ₽ ежемесячно до вычета НДФЛ (450 000 ₽ на руки).'
  );
  const foreign = planAnswer('Какая ожидаемая зарплата в EUR gross?', {
    salary,
    rules,
    profile,
  });
  assert.equal(
    foreign.text,
    'От 6 500 € ежемесячно до вычета налогов (5 500 € на руки).'
  );
  const owner = planAnswer(label, {
    salary,
    rules,
    profile: { salary_tax: 'моего налога' },
  });
  assert.equal(
    owner.text,
    'От 530 000 ₽ ежемесячно до вычета моего налога (450 000 ₽ на руки).'
  );
  assert.equal(owner.requiresReview, false);
});

test('contextual personal templates retain review for stale literals, missing basis, wrong period and unapproved values', () => {
  assert.equal(
    answer('I expect {{salary_net_usd}}, negotiable.').text,
    expected
  );
  const cases = [
    ['I expect {{salary_net_usd}}, plus 500.', {}],
    ['I expect {{salary_gross_usd}}, negotiable.', {}],
    ['I expect {{salary_net_hourly_usd}} per hour, negotiable.', {}],
    [
      'I expect {{salary_net_usd}}, negotiable.',
      { salary: { ...salary, approved: false } },
    ],
    [
      'I expect {{salary_net_usd}}, negotiable.',
      {
        rules: [
          rule({
            answers: [
              {
                text: 'I expect {{salary_net_usd}}, negotiable.',
                approved: false,
              },
            ],
          }),
        ],
      },
    ],
  ];
  for (const [template, options] of cases) {
    const result = answer(template, options);
    assert.equal(result.requiresReview, true, template);
    assert.ok(!result.text.includes('$6 000'), template);
  }
});

test('context substitution stays limited to salary intent and preserves rejection and disabled settings', () => {
  assert.equal(
    answer('I expect {{salary_net_usd}}, negotiable.').text,
    expected
  );
  const label = 'How can we contact you?';
  const text = '{{salary_net_usd}} / {{salary_net_eur}}';
  const result = planAnswer(label, {
    salary,
    rules: [rule({ question: label, answers: [{ text, approved: true }] })],
  });
  assert.equal(result.text, '$6 000 / 5 500 €');
  assert.equal(result.requiresReview, false);
  assert.equal(
    answer('I expect {{salary_net_usd}}, negotiable.', {
      policy: { rejected: ['negotiable'] },
    }).text,
    'From 5 500 € net per month.'
  );
  const disabled = answer('I expect {{salary_net_usd}}, negotiable.', {
    salary: { ...salary, enabled: false },
  });
  assert.equal(disabled.complete, false);
  assert.equal(disabled.requiresReview, true);
});

test(
  'stored contextual salary templates remain current through CLI, offline and both Lino previews',
  { timeout: 15000 },
  async () => {
    await assertStoredSalaryPreviews({
      id: 'salary-template-context',
      salary,
      question,
      rules: [rule()],
      verify(result) {
        assert.equal(result.text, expected);
        assert.equal(result.salaryTemplates.fields[0].currency, 'EUR');
        assert.equal(result.requiresReview, false);
      },
    });
  }
);
