import test from 'node:test';
import assert from 'node:assert/strict';
import { learnAnswerRules } from '../src/automation/question-learning.js';
import { planAnswer } from '../src/automation/question-answers.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  withMessageVersions,
  messageVersions,
} from '../src/storage/message-versions.js';
import {
  learnSavedAnswers,
  saveAnswerRule,
  previewAnswer,
} from '../src/automation/question-store.js';
import { createAnswerContractor } from '../src/automation/question-contraction.js';
import {
  correctionMessages,
  correctedRules,
  projectQuestion,
  searchQuestion,
  projectAnswer,
  searchAnswer,
  wrongAnswer,
} from '../../experiments/issue-56/question-corrections-fixture.mjs';

test('owner corrections exclude mixed apologies, other topics and quoted wrong answers from learning', () => {
  const messages = correctionMessages();
  const before = globalThis.structuredClone(messages);
  assert.deepEqual(learnAnswerRules(messages, { rules: correctedRules }), []);
  assert.deepEqual(messages, before);
});

test('clean corrected wording contributes only real observed turns and aliases use the same correction', () => {
  const messages = correctionMessages();
  messages[2].body = correctedRules[1].questions[0];
  messages[3].body = searchAnswer;
  const rules = learnAnswerRules(messages, { rules: correctedRules });
  assert.equal(rules.length, 1);
  assert.equal(rules[0].answers[0].text, searchAnswer);
  assert.equal(rules[0].answers[0].count, 1);
  assert.equal(rules[0].answers[0].approved, false);
  assert.deepEqual(rules[0].answers[0].evidence, [messages[3].id]);
});

test('corrections remove historical alternatives across rule IDs without inventing their frequency', () => {
  const old = {
    id: 'qa-rule:imported-search',
    question: searchQuestion,
    answers: [{ text: wrongAnswer, count: 900, approved: true }],
  };
  const result = planAnswer(searchQuestion, {
    rules: [...correctedRules, old],
  });
  assert.equal(result.text, searchAnswer);
  assert.equal(result.count, 0);
  assert.deepEqual(
    result.alternatives.map((a) => a.text),
    [searchAnswer]
  );
  assert.equal(result.requiresReview, false);
  const conflict = {
    ...correctedRules[1],
    id: 'qa-rule:other-correction',
    answers: [
      { text: 'Другая явная правка.', canonical: true, approved: true },
    ],
  };
  assert.equal(
    planAnswer(searchQuestion, { rules: [...correctedRules, conflict, old] })
      .requiresReview,
    true
  );
});

test('disabled, approximate and different-provider corrections do not erase unrelated observed answers', () => {
  for (const rule of [
    { ...correctedRules[1], enabled: false },
    { ...correctedRules[1], sources: ['telegram'] },
    { ...correctedRules[1], chats: ['hh:other'] },
    {
      ...correctedRules[1],
      question: 'Какой у вас опыт с распределённым поиском?',
      questions: [],
    },
  ]) {
    const rules = learnAnswerRules(correctionMessages(), { rules: [rule] });
    assert.equal(rules.length, 2);
  }
});

test('explicit contact contraction and profile expansion cannot bypass a correction', () => {
  const question = 'What is your email?';
  const rules = [
    {
      id: 'qa-rule:email-correction',
      question,
      answers: [{ text: '{{email}}', canonical: true, approved: true }],
    },
  ];
  const profile = { email: 'owner@example.test' };
  const messages = correctionMessages().slice(0, 2);
  messages[0].body = question;
  messages[1].body = profile.email;
  const contract = createAnswerContractor({ contract: true, profile });
  const learned = learnAnswerRules(messages, { rules, profile, contract });
  assert.equal(learned[0].answers[0].text, '{{email}}');
  messages[1].body = 'other@example.test';
  assert.deepEqual(
    learnAnswerRules(messages, { rules, profile, contract }),
    []
  );
});

test('persisted corrections survive edited message versions and repeated archive learning', async () => {
  const store = withMessageVersions(createMemoryStore());
  const messages = correctionMessages();
  for (const rule of correctedRules) {
    await saveAnswerRule(store, rule);
  }
  for (const message of messages) {
    await store.put(message);
  }
  await store.put({
    ...messages[1],
    body: `*${wrongAnswer}*`,
    edited: '2026-11-09T12:01:00Z',
  });
  const versions = await messageVersions(store, messages[1].id);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(
      (await learnSavedAnswers(store, { apply: true })).rules,
      []
    );
  }
  assert.deepEqual(await messageVersions(store, messages[1].id), versions);
  assert.equal(
    (await previewAnswer(store, { question: projectQuestion })).text,
    projectAnswer
  );
  assert.equal(
    (await store.query((link) => link.id.startsWith('qa-rule:'))).length,
    2
  );
});

test('private recruiter paths stay in the transcript and never enter reusable questions or answers', () => {
  for (const privateLink of [
    'https://candidate.example.test/private/cv/34',
    'https://candidate.example.test/%70rivate/cv/34',
  ]) {
    const messages = correctionMessages().slice(0, 2);
    messages[0].body = `Please share your CV via ${privateLink}?`;
    messages[1].body = 'Attached my CV.';
    assert.deepEqual(learnAnswerRules(messages), []);
    messages[0].body = 'Please share your CV?';
    messages[1].body = privateLink;
    assert.deepEqual(learnAnswerRules(messages), []);
  }
  const messages = correctionMessages().slice(0, 2);
  messages[0].body = 'Please share your public portfolio?';
  messages[1].body = 'https://portfolio.example.test/projects';
  assert.equal(learnAnswerRules(messages)[0].answers[0].text, messages[1].body);
});
