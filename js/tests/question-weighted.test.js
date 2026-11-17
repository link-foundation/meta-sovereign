import test from 'node:test';
import assert from 'node:assert/strict';
import { questionSimilarity } from '../src/automation/question-match.js';
import {
  planAnswer,
  normalizeAnswerAction,
} from '../src/automation/question-answers.js';
import { normalizeQuestionMatching } from '../src/automation/question-matching-options.js';
import { questionMatchingFlags } from '../src/cli/question-matching-flags.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { previewAnswer } from '../src/automation/question-store.js';
import { planFormAnswers } from '../src/forms/answer-plan.js';
import {
  formModelField,
  formModelInspection,
} from './helpers/forms-plan-inspection.mjs';
import { startServer } from '../src/server/index.js';
import {
  encodeWire,
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';
import { normalizeAutomation } from '../src/automation/automations.js';
import { toForm, checkForm } from '../src/web/automations-model.js';
import {
  weightedQuestions,
  seedWeightedAnswers,
} from '../../experiments/issue-56/question-weighted-fixture.mjs';

const matching = { algorithm: 'weighted', threshold: 0.7 };
const weighted = (a, b, budget, extra = {}) =>
  questionSimilarity(a, b, budget, { ...matching, ...extra });

test('weighted arithmetic combines character edits and distinct keyword overlap', () => {
  // cats red -> cats blue needs four edits; only cats is a shared keyword.
  const score = weighted('cats red', 'cats blue');
  assert.ok(Math.abs(score - (0.4 * (1 - 4 / 9) + 0.6 / 3)) < 1e-12);
  assert.equal(score, weighted('cats blue', 'cats red'));
  assert.equal(weighted('cats red', 'cats red'), 1);
  assert.equal(weighted('', 'cats'), 0);
  assert.equal(weighted('?!', '?'), 0);
});

test('weighted review recognizes reordered keywords and Russian inflection/address', () => {
  assert.ok(weighted('software engineer', 'engineer software') > 0.6);
  assert.equal(
    questionSimilarity('software engineer', 'engineer software'),
    0.5
  );
  assert.ok(
    weighted(
      'Какие ваши зарплатные ожидания?',
      'Поделитесь вашими зарплатными ожиданиями?'
    ) > 0.7
  );
  assert.equal(weighted('Какие твои ожидания?', 'Какие ваши ожидания?'), 1);
  assert.equal(weighted('Где ёлка?', 'Где елка?'), 1);
  assert.ok(weighted('Which CITY?', 'Which city?') > 0);
  assert.equal(
    weighted('Which CITY?', 'Which city?', undefined, { caseSensitive: true }),
    0
  );
  assert.equal(weighted('你的城市在哪里？', '你的城市在哪里？'), 1);
  assert.equal(weighted('आपका शहर कौन सा है?', 'आपका शहर कौन सा है?'), 1);
});

test('weighted similarity refuses unrelated subjects and generic shared wording', () => {
  for (const [a, b] of [
    ['What is your salary?', 'What is your city?'],
    ['Какой опыт на Go?', 'Какой опыт на C#?'],
    ['Salary expectations in USD?', 'Salary expectations in RUB?'],
    ['Оформление по ИП?', 'Оформление по ТК РФ?'],
    ['Your experience with FrobDB?', 'Your experience with OtherDB?'],
    ['Опыт разработки?', 'Работали раньше?'],
  ]) {
    assert.equal(weighted(a, b), 0, `${a} / ${b}`);
  }
});

test('weighted work has finite per-pair and shared budgets without a matrix allocation', () => {
  const budget = { remaining: 63, exhausted: false };
  assert.equal(weighted('cats red', 'cats red', budget), 0);
  assert.deepEqual(budget, { remaining: 63, exhausted: true });
  const admitted = { remaining: 64, exhausted: false };
  assert.equal(weighted('cats red', 'cats red', admitted), 1);
  assert.deepEqual(admitted, { remaining: 0, exhausted: false });
  const large = { remaining: 4 * 1024 ** 2, exhausted: false };
  assert.equal(weighted('z'.repeat(1100), 'z'.repeat(1100), large), 0);
  assert.equal(large.exhausted, true);
  assert.equal(large.remaining, 4 * 1024 ** 2);
});

test('weighted options validate, round trip through saved actions and preserve old defaults', () => {
  for (const algorithm of ['unknown', true, '', null, []]) {
    assert.throws(() => normalizeQuestionMatching({ algorithm }), /algorithm/u);
    assert.throws(
      () => questionMatchingFlags({ 'matching-algorithm': algorithm }),
      /algorithm/u
    );
  }
  assert.deepEqual(normalizeQuestionMatching(), {
    threshold: 0.78,
    caseSensitive: false,
  });
  assert.equal(normalizeAnswerAction({}).matching, undefined);
  const action = normalizeAutomation({
    id: 'weighted',
    action: { kind: 'answer-questions', matching },
  });
  assert.equal(action.action.matching.algorithm, 'weighted');
  const form = toForm(action);
  assert.deepEqual(checkForm(form, action).automation, action);
  assert.equal(
    questionMatchingFlags({
      matching: encodeWire({ algorithm: 'ordered' }).toString(),
      'matching-algorithm': 'weighted',
    }).matching.algorithm,
    'weighted'
  );
});

test('shared preview keeps weighted candidates frequency-ranked, read-only and reviewed', async () => {
  const store = createMemoryStore();
  await seedWeightedAnswers(store);
  const before = JSON.stringify(await store.query());
  const input = {
    question: weightedQuestions.asked,
    matching,
    matchPage: { limit: 1 },
  };
  assert.equal(
    (await previewAnswer(store, { ...input, matching: undefined })).match,
    'unanswered'
  );
  const result = await previewAnswer(store, input);
  assert.equal(result.match, 'approximate');
  assert.equal(result.text, weightedQuestions.answer);
  assert.equal(result.requiresReview, true);
  assert.ok(result.similarity > 0.7 && result.similarity < 1);
  assert.equal(result.matchResults.total, 2);
  assert.equal(result.matchResults.complete, true);
  assert.equal(result.matchResults.items[0].count, 9);
  const second = await previewAnswer(store, {
    ...input,
    matchPage: { offset: 1, limit: 1 },
  });
  assert.equal(second.matchResults.items[0].count, 2);
  assert.equal(
    (await previewAnswer(store, { ...input, approximate: false })).match,
    'unanswered'
  );
  const exact = await previewAnswer(store, {
    ...input,
    question: weightedQuestions.saved,
  });
  assert.equal(exact.match, 'exact');
  assert.equal(JSON.stringify(await store.query()), before);
});

test('weighted inspection marks exhausted matching work incomplete', () => {
  const budget = { remaining: 1, exhausted: false };
  const result = planAnswer(weightedQuestions.asked, {
    matching,
    matchBudget: budget,
    matchPage: {},
    rules: [
      {
        id: 'qa-rule:weighted',
        question: weightedQuestions.saved,
        answers: [{ text: 'Reviewed', count: 1, approved: true }],
      },
    ],
  });
  assert.equal(result.match, 'unanswered');
  assert.equal(result.matchResults.complete, false);
  assert.equal(budget.remaining, 1);
});

test('Forms shares weighted suggestions and preserves existing owner fields', async () => {
  const store = createMemoryStore();
  await seedWeightedAnswers(store);
  const report = formModelInspection([
    formModelField(weightedQuestions.asked),
    formModelField(weightedQuestions.asked, {
      id: 'frame-1:owner',
      value: 'Owner wording',
    }),
  ]);
  const result = await planFormAnswers(store, { inspection: report, matching });
  assert.equal(result.fields[0].answer.source, 'approximate');
  assert.equal(result.fields[0].answer.requiresReview, true);
  assert.equal(result.fields[0].answer.text, weightedQuestions.answer);
  assert.equal(result.fields[1].answer.preserveCurrent, true);
});

test('actual CLI preview applies the explicit method without storing it', async () => {
  const store = createMemoryStore();
  await seedWeightedAnswers(store);
  const before = JSON.stringify(await store.query());
  const commands = createAutomationCommands({
    openStore: async () => store,
    openReadOnly: async () => store,
  });
  const logs = [];
  await commands.automations(
    {
      _: ['answers', 'plan'],
      question: weightedQuestions.asked,
      'matching-algorithm': 'weighted',
      threshold: '0.7',
      json: true,
    },
    (text) => logs.push(text)
  );
  const result = JSON.parse(logs.at(-1));
  assert.equal(result.match, 'approximate');
  assert.equal(result.requiresReview, true);
  assert.equal(JSON.stringify(await store.query()), before);
});

test('both actual Lino transports expose weighted review with no provider effects', async () => {
  const store = createMemoryStore();
  await seedWeightedAnswers(store);
  let effects = 0;
  const handle = await startServer({
    store,
    storeDir: null,
    port: 0,
    host: '127.0.0.1',
    fileBackups: false,
    telegramAccount: false,
    enableSync: false,
    enableHandlers: false,
    automations: { scheduler: false },
    send: async () => {
      effects++;
    },
  });
  try {
    for (const type of [LINO_TEXT, LINO_BINARY]) {
      const response = await fetch(
        `http://127.0.0.1:${handle.port}/api/automations/answers/plan`,
        {
          method: 'POST',
          headers: { 'Content-Type': type, Accept: type },
          body: encodeWire(
            { question: weightedQuestions.asked, matching, matchPage: {} },
            type
          ),
        }
      );
      assert.equal(response.status, 200);
      const result = await readWireResponse(response);
      assert.equal(result.match, 'approximate');
      assert.equal(result.requiresReview, true);
      assert.equal(result.matchResults.total, 2);
      assert.equal(result.text, weightedQuestions.answer);
    }
    assert.equal(effects, 0);
  } finally {
    await handle.close();
  }
});
