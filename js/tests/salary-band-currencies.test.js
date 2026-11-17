import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';
import { assertStoredSalaryPreviews } from './helpers/salary-preview-surfaces.mjs';
import { currencyBandCase } from '../../experiments/issue-56/salary-band-currencies-fixture.mjs';

test('saved numeric bands honor configured currency codes and literal aliases', () => {
  for (const [code, alias] of [
    ['GBP', 'pounds'],
    ['JPY', '円'],
    ['INR', '₹'],
    ['CNY', '元'],
    ['CAD', 'Canadian dollars'],
    ['BTC', 'bitcoin'],
    ['CREDITS', 'loyalty credits'],
  ]) {
    for (const keyword of [code, alias]) {
      const input = currencyBandCase(code, keyword);
      const original = JSON.stringify(input);
      const result = planAnswer(input.question, input);
      assert.equal(result.text, input.options[1], keyword);
      assert.equal(result.salary.option.contained, true, keyword);
      assert.equal(result.requiresReview, false, keyword);
      assert.equal(JSON.stringify(input), original);
    }
  }
});

test('a conflicting specific saved amount holds every configured currency', () => {
  for (const code of ['GBP', 'JPY', 'INR', 'CREDITS']) {
    const input = currencyBandCase(code, code);
    input.rules[0].answers[0].text = `From ${code} 4000 net per month.`;
    const result = planAnswer(input.question, input);
    assert.equal(result.text, '', code);
    assert.equal(result.salary.savedAmountConflict, true, code);
    assert.equal(result.requiresReview, true, code);
  }
});

test('configured aliases do not approve personal explanations or foreign bands', () => {
  for (const text of [
    'I need pounds 5000 because I am relocating.',
    'GBP up to 5000 because I work part time.',
    'CHF up to 5000',
  ]) {
    const input = currencyBandCase();
    input.options[0] = text;
    input.rules[0].answers[0].text = text;
    const result = planAnswer(input.question, input);
    assert.equal(result.text, text);
    assert.equal(result.requiresReview, true);
  }
  const input = currencyBandCase('CAD', 'Canadian dollars');
  input.options.push('USD 5001–7999');
  const result = planAnswer(input.question, input);
  assert.equal(result.text, '');
  assert.equal(result.requiresReview, true);
});

test(
  'configured currency bands share the CLI, offline and Lino preview',
  { timeout: 15000 },
  async () => {
    const input = currencyBandCase();
    await assertStoredSalaryPreviews({
      ...input,
      id: 'currency-band',
      verify: (result) => {
        assert.equal(result.text, input.options[1]);
        assert.equal(result.requiresReview, false);
      },
    });
  }
);
