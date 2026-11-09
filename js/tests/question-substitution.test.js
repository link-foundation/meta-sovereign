import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/index.js';
import { saveAnswerPolicy } from '../src/automation/question-policy.js';
import {
  saveAnswerRule,
  previewAnswer,
  learnSavedAnswers,
} from '../src/automation/question-store.js';

const salary = {
  enabled: true,
  approved: true,
  defaultCurrency: 'USD',
  monthlyHours: 160,
  currencies: [
    { code: 'USD', keywords: ['USD', '$'], net: 6000, gross: 7100 },
    { code: 'EUR', keywords: ['EUR', '€'], net: 5500, gross: 6500 },
    { code: 'USDT', keywords: ['USDT'], net: 6000, gross: 7100 },
  ],
};
const profile = { email: 'owner@example.test', phone: '+79582000567' };
const rule = (text, question = 'How can we contact you?') => ({
  id: 'contacts',
  question,
  answers: [{ text, approved: true, count: 0 }],
});
const save = (store, text, options = {}) =>
  saveAnswerRule(store, { ...rule(text), contract: true, profile, ...options });

test('saving configured contacts contracts whole values and formatted phones', async () => {
  const store = createMemoryStore();
  const saved = await save(
    store,
    'Email owner@example.test; call +7 (958) 200-05-67.'
  );
  assert.equal(saved.answers[0].text, 'Email {{email}}; call {{phone}}.');
  const result = await previewAnswer(store, {
    question: saved.question,
    profile: { email: 'new@example.test', phone: '+12025550123' },
  });
  assert.equal(result.text, 'Email new@example.test; call +12025550123.');
  assert.equal(result.requiresReview, false);
});

test('ambiguous values, short fragments and URL schemes stay literal', async () => {
  const store = createMemoryStore();
  const saved = await save(store, 'https and Owner; xxowner@example.testx', {
    profile: {
      site: 'https',
      first: 'Owner',
      second: 'OWNER',
      email: profile.email,
    },
  });
  assert.equal(saved.answers[0].text, 'https and Owner; xxowner@example.testx');
});

test('salary placeholders resolve independent currencies and rounded hourly targets', async () => {
  const store = createMemoryStore();
  await saveAnswerRule(
    store,
    rule(
      '{{salary_net_usd}} / {{salary_gross_hourly_eur}} / {{salary_net_usdt}}'
    )
  );
  const result = await previewAnswer(store, {
    question: 'How can we contact you?',
    salary,
  });
  assert.equal(result.text, '$6 000 / 45 € / 6 000 USDT');
  assert.equal(result.requiresReview, false);
  assert.equal(result.salaryTemplates.fields.length, 3);
  const pending = await previewAnswer(store, {
    question: result.question,
    salary: { ...salary, approved: false },
  });
  assert.equal(pending.requiresReview, true);
});

test('salary contraction keeps USD distinct from USDT and respects numeric boundaries', async () => {
  const store = createMemoryStore();
  const saved = await save(store, '$6000; 6 000 USDT; 60000 USD; 6000.25 USD', {
    salary,
  });
  assert.equal(
    saved.answers[0].text,
    '{{salary_net_usd}}; {{salary_net_usdt}}; 60000 USD; 6000.25 USD'
  );
});

test('unchanged rendered templates retain their original placeholders', async () => {
  const store = createMemoryStore();
  await saveAnswerRule(store, rule('Write to {{email}}.'));
  const saved = await save(store, 'Write to owner@example.test.');
  assert.equal(saved.answers[0].text, 'Write to {{email}}.');
  const plain = await saveAnswerRule(store, {
    ...rule('Write to owner@example.test.'),
    profile,
  });
  assert.equal(plain.answers[0].text, 'Write to owner@example.test.');
});

test('learning configured substitutions remains reviewable and repeatable', async () => {
  const store = createMemoryStore();
  for (const [id, sender, body] of [
    [1, 'contact', 'How can we contact you?'],
    [2, 'me', 'Email owner@example.test.'],
  ]) {
    await store.put({
      id: `msg:hh:1:${id}`,
      source: 'hh',
      chat: '1',
      sender,
      body,
      timestamp: new Date(Date.UTC(2026, 10, 9, 12, id)).toISOString(),
    });
  }
  const options = { contract: true, profile };
  const proposed = await learnSavedAnswers(store, options);
  assert.equal(proposed.rules[0].answers[0].text, 'Email {{email}}.');
  assert.equal(proposed.rules[0].answers[0].approved, false);
  assert.equal(
    (await store.query((link) => link.tokens?.includes('qa-rule'))).length,
    0
  );
  const first = await learnSavedAnswers(store, { ...options, apply: true });
  const second = await learnSavedAnswers(store, { ...options, apply: true });
  assert.deepEqual(second.rules, first.rules);
  assert.equal(second.rules[0].answers[0].count, 1);
});

test('generic salary placeholders follow question context and explicit mismatches need review', async () => {
  const store = createMemoryStore();
  const question = 'What salary in EUR do you expect?';
  await saveAnswerRule(
    store,
    rule('I expect {{salary_net}}, negotiable.', question)
  );
  const result = await previewAnswer(store, { question, salary });
  assert.equal(result.text, 'I expect 5 500 €, negotiable.');
  assert.equal(result.requiresReview, false);
  await saveAnswerRule(
    store,
    rule('I expect {{salary_net_usd}}, negotiable.', question)
  );
  const mismatch = await previewAnswer(store, { question, salary });
  assert.equal(mismatch.requiresReview, true);
  assert.equal(mismatch.salaryTemplates.contextMismatch, true);
});

test('stale calculated salary placeholders cannot inherit supplied profile estimates', async () => {
  const store = createMemoryStore();
  const input = {
    ...salary,
    currencies: [
      { code: 'USD', keywords: ['USD'], net: 6000, grossMethod: 'personal' },
    ],
    exchange: {
      source: 'manual',
      asOf: '2026-01-01',
      base: 'RUB',
      maxAgeDays: 7,
      rates: [{ code: 'USD', rate: 80 }],
    },
    taxes: {
      personal: { currency: 'RUB', bands: [{ upTo: null, rate: 0.13 }] },
    },
  };
  await saveAnswerRule(store, rule('Target: {{salary_gross_usd}}.'));
  const result = await previewAnswer(store, {
    question: 'How can we contact you?',
    salary: input,
    now: Date.parse('2026-11-09T12:00:00Z'),
    profile: { salary_gross_usd: '$6 900' },
  });
  assert.equal(result.complete, false);
  assert.equal(result.requiresReview, true);
  assert.equal(result.text, 'Target: {{salary_gross_usd}}.');
  assert.equal(
    result.salaryTemplates.fields[0].missing,
    'salary_exchange_stale'
  );
});

test('a monthly placeholder cannot automatically answer an hourly question', async () => {
  const store = createMemoryStore();
  const question = 'What hourly salary in USD do you expect?';
  await saveAnswerRule(store, rule('Target: {{salary_net_usd}}.', question));
  const result = await previewAnswer(store, { question, salary });
  assert.equal(result.salaryTemplates.contextMismatch, true);
  assert.equal(result.requiresReview, true);
});

test('contracting a canonical answer cannot hide explicitly rejected content', async () => {
  const store = createMemoryStore();
  await saveAnswerPolicy(store, { rejected: [profile.email] });
  await assert.rejects(
    saveAnswerRule(store, {
      ...rule('Write to owner@example.test.'),
      answers: [{ text: 'Write to owner@example.test.', canonical: true }],
      contract: true,
      profile,
    }),
    /canonical answer contains rejected content/u
  );
});
