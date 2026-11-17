import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';
import { assertStoredSalaryPreviews } from './helpers/salary-preview-surfaces.mjs';
import {
  intentSalary as salary,
  salaryIntentQuestion as question,
  salaryIntentExpected as expected,
} from '../../experiments/issue-56/salary-intent-fixture.mjs';

test('ordinary expected-income requests and informal imperatives resolve current salary targets', () => {
  for (const label of [
    'Какую вилку рассматриваете для себя?',
    'На какой уровень дохода вы ориентируетесь?',
    'Ваши ожидания по оплате?',
    'Доход для себя?',
    'Укажи желаемую оплату',
    'Напиши размер ожидаемого дохода',
    'Добрый день! Спасибо за отклик.Напишите,пожалуйста,уровень дохода,который Вы рассматриваете. Спасибо!',
  ]) {
    const answer = planAnswer(label, { salary });
    assert.equal(answer.text, 'От 450 000 ₽ в месяц на руки.', label);
    assert.equal(answer.complete, true);
    assert.equal(answer.requiresReview, false);
  }
});

test('gross and net aliases retain independent values and ambiguous dual-basis requests', () => {
  for (const alias of ['брутто', 'до уплаты налогов', 'до НДФЛ', 'до вычета']) {
    const answer = planAnswer(`Ожидания по зарплате в EUR ${alias}?`, {
      salary,
    });
    assert.equal(answer.salary.basis, 'gross', alias);
    assert.equal(answer.text, expected, alias);
  }
  for (const alias of ['нетто', 'после вычета налогов', 'после уплаты НДФЛ']) {
    const answer = planAnswer(`Ожидания по зарплате в EUR ${alias}?`, {
      salary: { ...salary, defaultBasis: 'gross' },
    });
    assert.equal(answer.salary.basis, 'net', alias);
    assert.equal(answer.text, 'От 5 500 € в месяц на руки.', alias);
  }
  const both = planAnswer('Зарплатные ожидания EUR брутто и нетто?', {
    salary,
  });
  assert.equal(both.salary.basis, 'both');
  assert.deepEqual(both.salary.amounts, { net: 5500, gross: 6500 });
});

test('hourly abbreviations and explicit unsupported pay periods cannot become monthly targets', () => {
  for (const label of [
    'Какую оплату за час в EUR ожидаете?',
    'Ваша ставка EUR/ч?',
    'What pay in EUR/hr do you expect?',
    'What rate in EUR an hour do you expect?',
  ]) {
    const answer = planAnswer(label, { salary });
    assert.equal(answer.salary?.period, 'hour', label);
    assert.equal(answer.salary.amount, 35, label);
    assert.equal(answer.complete, true);
  }
  for (const label of [
    'Какую зарплату за год ожидаете?',
    'Оплата за день?',
    'Ожидания по зарплате в месяц и за час?',
  ]) {
    const answer = planAnswer(label, { salary });
    assert.ok(answer.match !== 'salary' || !answer.complete, label);
    assert.equal(answer.requiresReview, true, label);
  }
});

test('expected-income recognition excludes current jobs, previous pay and proposed-offer acceptance', () => {
  for (const label of [
    'Уровень дохода на текущем месте?',
    'Какую компенсацию сейчас получаете?',
    'Какую зарплату получали?',
    'Рассматриваете ли вилку зарплаты 100–200 тысяч?',
    'Какой доход в рамках предложенного варианта оформления?',
    'Как настроить расчёт зарплаты?',
    'Какая последняя почасовая ставка?',
  ]) {
    assert.notEqual(planAnswer(label, { salary }).match, 'salary', label);
  }
  assert.equal(
    planAnswer('Ваши текущие зарплатные ожидания?', { salary }).match,
    'salary'
  );
  const assembled = planAnswer(
    '1. Какую вилку рассматриваете для себя?\n2. Какой ваш GitHub?',
    { salary }
  );
  assert.equal(assembled.match, 'assembled');
  assert.equal(assembled.complete, false);
  assert.equal(assembled.requiresReview, true);
  assert.ok(assembled.text.includes('{{answer:2}}'));
});

test('short alias follow-ups preserve only the nearest related salary topic and period', () => {
  const recent = ['Какая ваша почасовая ставка в USD?'];
  for (const alias of ['EUR брутто?', 'А в EUR до НДФЛ?']) {
    const answer = planAnswer(alias, { salary, recent });
    assert.equal(answer.text, 'От 45 € в час до вычета налогов.', alias);
  }
  assert.notEqual(
    planAnswer('EUR брутто?', {
      salary,
      recent: ['Какая ваша должность?', ...recent],
    }).match,
    'salary'
  );
});

test(
  'CLI, offline and both Lino previews retain ordinary salary intent without stored-data changes',
  { timeout: 15000 },
  async () => {
    await assertStoredSalaryPreviews({
      id: 'salary-intent',
      salary,
      question,
      verify(answer) {
        assert.equal(answer.text, expected);
        assert.equal(answer.salary.basis, 'gross');
        assert.equal(answer.salary.currency, 'EUR');
        assert.equal(answer.requiresReview, false);
      },
    });
  }
);
