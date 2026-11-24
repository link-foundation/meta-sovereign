import test from 'node:test';
import assert from 'node:assert/strict';
import { salaryPeriod } from '../src/automation/salary-question.js';

test('hourly inflections are bounded words while common abbreviations remain recognized', () => {
  for (const label of [
    'часовая ставка',
    'часовую ставку',
    'почасовая оплата',
    'EUR/ч',
    'EUR/hr',
    'per hour',
  ]) {
    assert.equal(salaryPeriod(label), 'hour', label);
  }
  for (const label of [
    `часов${'а'.repeat(33)} ставка`,
    'часов🙂 ставка',
    'часов/контракт ставка',
  ]) {
    assert.equal(salaryPeriod(label), null, label);
  }
  assert.equal(salaryPeriod('часов'.repeat(4000)), null);
  assert.equal(salaryPeriod('в месяц и за час'), 'ambiguous');
});
