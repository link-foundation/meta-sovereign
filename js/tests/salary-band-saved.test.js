import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { normalizeAutomation } from '../src/automation/automations.js';
import { assertQuestionPreviewSurfaces } from './helpers/question-surfaces.mjs';
import {
  bandSalary as salary,
  bandQuestion as question,
  bandSavedRule,
} from '../../experiments/issue-56/salary-band-safety-fixture.mjs';

test('saved offered boundaries and scales yield to the current containing band', () => {
  for (const previous of [
    'USD up to 5000',
    'USD under 5000',
    'USD below 5000',
    'USD less than 5000',
    'USD at least 8000',
    'USD 8000 or more',
    'USD 8000 and above',
    'USD over 8000',
    'USD above 8000',
    'USD more than 8000',
    'USD ≥ 8000',
    'USD < 5000',
    'USD between 4 and 5 thousand',
    'USD 4k–5k',
    'USD 1 million–2 million',
  ]) {
    const options = [previous, 'USD 5001–7999'];
    const rules = [bandSavedRule(previous)];
    const result = planAnswer(question, { salary, options, rules });
    assert.equal(result.text, options[1], previous);
    assert.equal(result.salary.option.contained, true, previous);
    assert.equal(result.requiresReview, false, previous);
    assert.equal(rules[0].answers[0].text, previous);
  }
});

test('saved Russian offered boundaries keep the same numeric contract', () => {
  const configured = {
    ...salary,
    defaultCurrency: 'RUB',
    currencies: [{ code: 'RUB', keywords: ['RUB', 'руб.'], net: 6000 }],
  };
  const prompt = 'Какую зарплату в RUB на руки вы ожидаете?';
  for (const previous of [
    'RUB не менее 8000',
    'RUB 8000 и выше',
    'RUB свыше 8000',
    'RUB более 8000',
    'RUB менее 5000',
    'RUB между 4 и 5 тыс.',
    'RUB 4к–5к',
    'RUB 1м–2м',
  ]) {
    const result = planAnswer(prompt, {
      salary: configured,
      options: [previous, 'RUB 5001–7999'],
      rules: [bandSavedRule(previous, { question: prompt })],
    });
    assert.equal(result.text, 'RUB 5001–7999', previous);
    assert.equal(result.requiresReview, false, previous);
  }
});

test('saved boundary wording does not approve personal explanations or ambiguous choices', () => {
  for (const text of [
    'I need up to USD 5000 for my relocation.',
    'USD 4 thousand because I work from home.',
    'Мне нужно от 4000 RUB для переезда.',
  ]) {
    const result = planAnswer(question, {
      salary,
      options: [text, 'USD 5001–7999'],
      rules: [bandSavedRule(text)],
    });
    assert.equal(result.text, text);
    assert.equal(result.requiresReview, true);
  }
  for (const options of [
    ['USD at least 4000', 'USD 5001–7999'],
    ['USD up to 5000', 'USD 8000 or more'],
    ['EUR up to 5000', 'USD 5001–7999'],
  ]) {
    const result = planAnswer(question, {
      salary,
      options,
      rules: [bandSavedRule(options[0])],
    });
    assert.equal(result.text, '');
    assert.equal(result.complete, false);
    assert.equal(result.requiresReview, true);
  }
});

test('one matching saved basis cannot conceal a conflicting second amount', () => {
  const prompt = 'What salary in USD gross and net do you expect?';
  for (const text of [
    'From USD 6000 net and USD 6500 gross per month.',
    'From USD 4000 net and USD 7100 gross per month.',
  ]) {
    const result = planAnswer(prompt, {
      salary,
      options: ['USD 5000–8000', 'USD 8001–10000'],
      rules: [bandSavedRule(text, { question: prompt })],
    });
    assert.equal(result.text, '', text);
    assert.equal(result.complete, false);
    assert.equal(result.requiresReview, true);
    assert.equal(result.salary.savedAmountConflict, true);
  }
});

test(
  'saved English boundaries use current targets through every shared preview transport',
  { timeout: 15000 },
  async () => {
    const store = createMemoryStore();
    const previous = 'USD up to 5000';
    await store.put(bandSavedRule(previous));
    await store.put(
      normalizeAutomation({
        id: 'band-saved',
        action: { kind: 'answer-questions', salary },
      })
    );
    const original = JSON.stringify(await store.query(() => true));
    await assertQuestionPreviewSurfaces({
      store,
      automationId: 'band-saved',
      input: { question, salary, options: [previous, 'USD 5001–7999'] },
      verify: (result) => {
        assert.equal(result.text, 'USD 5001–7999');
        assert.equal(result.requiresReview, false);
      },
    });
    assert.equal(JSON.stringify(await store.query(() => true)), original);
  }
);
