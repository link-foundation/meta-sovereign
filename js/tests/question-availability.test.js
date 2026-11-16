import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  learnSavedAnswers,
  previewAnswer,
  saveAnswerRule,
} from '../src/automation/question-store.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import { postQuestion } from './helpers/question-http.mjs';
import {
  question,
  preferred,
  aliases,
  unrelated,
  availabilityRule,
  availabilityMessages,
} from '../../experiments/issue-56/answer-availability-fixture.mjs';

test('joining-time questions exclude unrelated stored replies across providers and supported languages', () => {
  for (const [prompt, timing, wrong] of [
    [question, preferred, unrelated],
    [
      'Как скоро вы сможете приступить к работе?',
      'Через две недели после оффера.',
      'Измеряю производительность по задержке ответа.',
    ],
    [
      'आप काम कब शुरू कर सकते हैं?',
      'दो सप्ताह के बाद।',
      'मैं सेवा के प्रदर्शन का विश्लेषण करता हूँ।',
    ],
    [
      '你什么时候可以开始工作？',
      '收到录用通知后两周。',
      '我通过响应延迟评估服务性能。',
    ],
  ]) {
    const rule = availabilityRule();
    rule.question = prompt;
    rule.answers[0].text = wrong;
    rule.answers[1].text = timing;
    const before = globalThis.structuredClone(rule);
    for (const source of ['hh', 'telegram', 'vk']) {
      const result = planAnswer(prompt, { rules: [rule], source });
      assert.equal(result.text, timing);
      assert.equal(result.count, 1);
      assert.equal(result.requiresReview, false);
      assert.ok(result.alternatives.every(({ text }) => text !== wrong));
    }
    assert.deepEqual(rule, before);
  }
});

test('timing guards preserve distinct commitments, conditional answers and unrelated questions', () => {
  for (const answer of [
    'In a month.',
    'In 2–3 weeks.',
    'Immediately.',
    'After we agree a date.',
    'Через месяц.',
    'Сразу.',
    'तुरंत।',
    '明天。',
  ]) {
    const result = planAnswer(question, {
      rules: [
        { ...availabilityRule(), answers: [{ text: answer, approved: true }] },
      ],
    });
    assert.equal(result.text, answer);
  }
  for (const prompt of [
    'How long will this project take?',
    'Как выйти из сложной ситуации?',
    'Какие метрики производительности используете?',
  ]) {
    const rule = { ...availabilityRule(), question: prompt };
    assert.equal(planAnswer(prompt, { rules: [rule] }).text, unrelated);
  }
  for (const [prompt, answer] of [
    ['Can you start work in two weeks?', 'Yes.'],
    ['Готовы ли вы приступить к работе через две недели?', 'Да.'],
    ['Готовы ли вы выйти на работу в офисе?', 'Да.'],
    ['क्या आप दो सप्ताह में काम शुरू कर सकते हैं?', 'हाँ।'],
    ['你可以在两周后开始工作吗？', '是的。'],
  ]) {
    assert.equal(
      planAnswer(prompt, {
        rules: [
          {
            ...availabilityRule(),
            question: prompt,
            answers: [{ text: answer, approved: true }],
          },
        ],
      }).text,
      answer
    );
  }
  const noTiming = planAnswer(question, {
    rules: [
      { ...availabilityRule(), answers: [{ text: 'Yes.', approved: true }] },
    ],
  });
  assert.equal(noTiming.match, 'unanswered');
  const unapproved = planAnswer(question, {
    rules: [{ ...availabilityRule(), answers: [{ text: preferred }] }],
  });
  assert.equal(unapproved.requiresReview, true);
});

test(
  'archived learning excludes irrelevant timing replies without changing transcripts or replaying observations',
  { timeout: 10000 },
  async (t) => {
    const store = createMemoryStore();
    t.after(() => store.close?.());
    await saveAnswerRule(store, {
      ...availabilityRule(),
      answers: [{ text: preferred, approved: true, equivalents: aliases }],
    });
    const messages = availabilityMessages();
    await store.putMany(messages);
    await learnSavedAnswers(store, { apply: true });
    const learned = await store.query((row) => row.id.startsWith('qa-rule:'));
    assert.ok(
      learned.every((rule) =>
        rule.answers.every(({ text }) => text !== unrelated)
      )
    );
    assert.equal((await previewAnswer(store, { question })).count, 4);
    await learnSavedAnswers(store, { apply: true });
    assert.deepEqual(
      await store.query((row) => row.id.startsWith('qa-rule:')),
      learned
    );
    assert.deepEqual(
      await store.query((row) => row.id.startsWith('msg:')),
      messages
    );
  }
);

test(
  'CLI, offline and both Lino plans share timing exclusion without rewriting saved variants',
  { timeout: 10000 },
  async (t) => {
    const store = createMemoryStore();
    const { server, base } = await formReviewHttp({ store }, LINO_TEXT);
    t.after(async () => {
      await server.close();
      await store.close?.();
    });
    const saved = await saveAnswerRule(store, availabilityRule());
    const output = [];
    const commands = createAutomationCommands({
      openStore: async () => store,
      send: async () => assert.fail('read-only preview never sends'),
    });
    assert.equal(
      await commands.automations(
        { _: ['answers', 'plan'], question, json: true },
        (line) => output.push(line)
      ),
      0
    );
    assert.equal(JSON.parse(output.at(-1)).text, preferred);
    const offline = questionApi({
      store,
      remote: { get: async () => null, report: async () => null },
    });
    assert.equal((await offline.previewAnswer({ question })).text, preferred);
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      const result = await postQuestion(base, 'plan', { question }, media);
      assert.equal(result.status, 200);
      assert.equal(result.body.text, preferred);
      assert.equal(result.body.count, 1);
    }
    assert.deepEqual(await store.get(saved.id), saved);
  }
);
