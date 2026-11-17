import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';
import { salaryOptionConfig } from '../../experiments/issue-56/salary-option-fixture.mjs';

const answer = (choices, amount, code = 'USD') =>
  planAnswer(`What salary in ${code} net do you expect?`, {
    salary: {
      ...salaryOptionConfig,
      defaultCurrency: code,
      currencies: [{ code, keywords: [code], net: amount }],
    },
    options: choices,
  });

test('salary bands read grouped numbers and explicit word or Cyrillic scales', () => {
  for (const [label, amount, code] of [
    ['RUB 90.000–120.000', 110000, 'RUB'],
    ['RUB 90,000–120,000', 110000, 'RUB'],
    ['От 100к до 120к руб.', 110000, 'RUB'],
    ['USD 5 thousand–8 thousand', 6000, 'USD'],
    ['USD 1 million–2 million', 1500000, 'USD'],
    ['RUB 1м–2м', 1500000, 'RUB'],
    ['EUR 1,5k–2k', 1750, 'EUR'],
  ]) {
    const result = answer([label], amount, code);
    assert.equal(result.text, label);
    assert.equal(result.requiresReview, false);
  }
});

test('a common scale only applies to an abbreviated endpoint', () => {
  for (const label of [
    'USD 5000–8 thousand',
    'USD 5 thousand–8000',
    'USD 5–8 thousand',
    'USD 5000–8k',
  ]) {
    assert.equal(answer([label], 6000).text, label);
  }
});

test('inclusive salary floors retain their boundary while exclusive floors do not', () => {
  for (const label of [
    'USD 6000 or more',
    'USD 6000 and above',
    'USD at least 6000',
    'USD >= 6000',
    'USD ≥ 6000',
    'RUB 6000 и выше',
    'RUB не менее 6000',
  ]) {
    const code = label.startsWith('RUB') ? 'RUB' : 'USD';
    assert.equal(answer([label], 6000, code).text, label);
    assert.equal(answer([label], 7000, code).text, label);
    assert.equal(answer([label], 5000, code).complete, false);
  }
  for (const label of [
    'USD over 6000',
    'USD > 6000',
    'RUB свыше 6000',
    'RUB выше 6000',
  ]) {
    const code = label.startsWith('RUB') ? 'RUB' : 'USD';
    assert.equal(answer([label], 6000, code).complete, false);
    assert.equal(answer([label], 7000, code).text, label);
  }
});

test('inclusive and exclusive salary ceilings preserve shared-boundary ambiguity', () => {
  for (const label of [
    'USD up to 6000',
    'USD <= 6000',
    'USD ≤ 6000',
    'RUB до 6000',
  ]) {
    const code = label.startsWith('RUB') ? 'RUB' : 'USD';
    assert.equal(answer([label], 6000, code).text, label);
    assert.equal(answer([label], 5000, code).text, label);
    assert.equal(answer([label], 7000, code).complete, false);
  }
  for (const label of [
    'USD under 6000',
    'USD less than 6000',
    'RUB менее 6000',
  ]) {
    const code = label.startsWith('RUB') ? 'RUB' : 'USD';
    assert.equal(answer([label], 6000, code).complete, false);
    assert.equal(answer([label], 5000, code).text, label);
  }
  const result = answer(['USD up to 6000', 'USD 6000 or more'], 6000);
  assert.equal(result.complete, false);
  assert.equal(result.requiresReview, true);
});

test('negated salary labels, malformed numbers and unit-like words stay unresolved', () => {
  for (const [label, amount] of [
    ['USD not between 5000 and 8000', 6000],
    ['USD except 6000', 6000],
    ['USD 5 thousandly–8 thousandly', 6],
    ['USD 5,00,0–8,00,0', 6000],
  ]) {
    const result = answer([label], amount);
    assert.equal(result.complete, false, label);
    assert.equal(result.requiresReview, true, label);
  }
});
