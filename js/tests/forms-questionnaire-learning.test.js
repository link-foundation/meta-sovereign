import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createAnswerPairLearner } from '../src/automation/question-learning.js';
import {
  listAnswerRules,
  saveAnswerRule,
} from '../src/automation/question-store.js';
import { learnFormAnswerPairs } from '../src/forms/answer-learning.js';
import { saveAnswerPolicy } from '../src/automation/question-policy.js';
import {
  questions,
  answers,
} from '../../experiments/issue-56/question-lists-fixture.mjs';
import {
  learningQuestions,
  learningAnswers,
  observedQuestionnaire,
} from '../../experiments/issue-56/forms-questionnaire-learning-fixture.mjs';

const verify = (
  rules,
  wholeQuestion = learningQuestions,
  wholeAnswer = learningAnswers
) => {
  assert.equal(
    rules.length,
    3,
    'retain the whole pair and both aligned components'
  );
  assert.equal(rules[0].question, wholeQuestion);
  assert.equal(rules[0].answers[0].text, wholeAnswer);
  for (const rule of rules) {
    assert.equal(rule.answers[0].approved, false);
    assert.notEqual(rule.answers[0].canonical, true);
  }
};

test('explicitly paired questionnaire learning retains conditional parts, whole wording and the original observation count', () => {
  const learner = createAnswerPairLearner();
  learner.add(questions, answers, ['form:confirmed:1'], 7);
  const rules = learner.values();
  verify(rules, questions, answers);
  assert.equal(
    rules[1].question,
    'Which languages do you use?\nIf Python, describe one project.'
  );
  assert.equal(rules[1].answers[0].text, 'Python.\nBuilt a search service.');
  assert.equal(rules[2].answers[0].text, 'Hanoi.');
  for (const rule of rules) {
    assert.equal(rule.answers[0].count, 7);
    assert.deepEqual(rule.answers[0].evidence, ['form:confirmed:1']);
  }
});

test('observed form questionnaires persist whole and component proposals with nonnegative pair counters and idempotent replay', async () => {
  const store = createMemoryStore();
  const pairs = [observedQuestionnaire(), observedQuestionnaire({ text: '' })];
  const result = await learnFormAnswerPairs(store, pairs);
  assert.equal(result.saved, 3);
  assert.equal(
    result.skipped,
    1,
    'skipped counts input pairs, not derived proposals'
  );
  const rules = await listAnswerRules(store);
  verify([
    rules.find((r) => r.question === learningQuestions),
    ...rules.filter((r) => r.question !== learningQuestions),
  ]);
  for (const rule of rules) {
    assert.equal(rule.answers[0].count, 1);
    assert.deepEqual(rule.answers[0].evidence, [
      'form:questionnaire:confirmed',
    ]);
  }
  const before = globalThis.structuredClone(rules);
  const replay = await learnFormAnswerPairs(store, pairs);
  assert.equal(replay.saved, 0);
  assert.equal(replay.skipped, 2);
  assert.deepEqual(await listAnswerRules(store), before);
});

test('ambiguous form replies remain whole and are not guessed into component knowledge', async () => {
  const store = createMemoryStore();
  for (const [index, text] of [
    '2. Hanoi.\n1. Rust.',
    '- Rust.\n- Hanoi.',
    '1. Rust.',
  ].entries()) {
    await learnFormAnswerPairs(store, [
      observedQuestionnaire({ text, evidence: `form:ambiguous:${index}` }),
    ]);
  }
  const rules = await listAnswerRules(store);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].question, learningQuestions);
  assert.equal(rules[0].answers.length, 3);
  assert(
    rules[0].answers.every((answer) => !answer.approved && answer.count === 1)
  );
});

test('form questionnaire components retain rejection, privacy and current canonical correction guards', async () => {
  const store = createMemoryStore();
  await saveAnswerRule(store, {
    id: 'location',
    question: 'Where do you live?',
    answers: [
      { text: 'Remote only', canonical: true, approved: true, count: 4 },
    ],
  });
  await saveAnswerPolicy(store, { rejected: ['Rust and Python.'] });
  for (const pair of [
    observedQuestionnaire(),
    observedQuestionnaire({
      question: `${learningQuestions}\nhttps://example.test/private/token`,
    }),
    observedQuestionnaire({
      text: '1. https://example.test/private/token\n2. Hanoi.',
    }),
  ]) {
    const result = await learnFormAnswerPairs(store, [pair]);
    assert.equal(result.saved, 0);
    assert.equal(result.skipped, 1);
  }
  const rules = await listAnswerRules(store);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].answers[0].approved, true);
  assert.equal(rules[0].answers[0].count, 4);
});

test('zero-observation saved questionnaire backfill never invents a form submission or grants approval', () => {
  const learner = createAnswerPairLearner();
  learner.add(learningQuestions, learningAnswers, [], 0);
  verify(learner.values());
  for (const rule of learner.values()) {
    assert.equal(rule.answers[0].count, 0);
    assert.deepEqual(rule.answers[0].evidence, []);
  }
});
