import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { extractAnswerProfile } from '../src/automation/question-profile-source.js';
import { saveAnswerProfile } from '../src/automation/question-profiles.js';
import {
  saveAnswerRule,
  previewAnswer,
} from '../src/automation/question-store.js';
import { planFormAnswers } from '../src/forms/answer-plan.js';
import {
  formModelField,
  formModelInspection,
} from './helpers/forms-plan-inspection.mjs';

const questions = [
  'What salary in USD do you expect?',
  'What salary in RUB before taxes do you expect?',
  'What is your email?',
  'What is your GitHub?',
];
const questionnaire = (parts = questions) =>
  parts.map((part, index) => `${index + 1}. ${part}`).join('\n');
const salary = {
  exchangeMode: 'snapshot',
  enabled: true,
  approved: true,
  defaultCurrency: 'RUB',
  defaultBasis: 'net',
  monthlyHours: 160,
  currencies: [
    { code: 'RUB', keywords: ['RUB'], net: 450000, gross: 530000 },
    { code: 'USD', keywords: ['USD'], net: 6000, gross: 7100 },
  ],
};
const setup = async () => {
  const store = createMemoryStore();
  const extracted = await extractAnswerProfile(store, {
    text: 'Email: owner@example.test\nGitHub: https://github.com/example-owner',
  });
  assert.equal(extracted.readOnly, true);
  assert.equal(extracted.requiresReview, true);
  assert.equal((await store.query(() => true)).length, 0);
  const profile = await saveAnswerProfile(store, {
    id: 'owner',
    name: 'Reviewed owner contacts',
    values: extracted.profile,
  });
  for (const [index, key] of ['email', 'github'].entries()) {
    await saveAnswerRule(store, {
      id: `assembly-${key}`,
      question: questions[index + 2],
      answers: [{ text: `{{${key}}}`, approved: true, count: 2 }],
    });
  }
  return {
    store,
    profile,
    input: { question: questionnaire(), salary, profileId: profile.id },
  };
};

test('assembled questionnaires resolve each salary and reviewed contact independently across providers and form fields', async () => {
  const { store, input, profile } = await setup();
  const before = globalThis.structuredClone(await store.query(() => true));
  for (const source of ['hh', 'telegram', 'vk', 'email', 'whatsapp']) {
    for (const questionMode of [undefined, 'field']) {
      const result = await previewAnswer(store, {
        ...input,
        source,
        chat: 'fixture',
        questionMode,
      });
      assert.equal(result.match, 'assembled');
      assert.equal(result.complete, true);
      assert.equal(result.requiresReview, true);
      assert.equal(result.profileSource.revision, profile.revision);
      assert.deepEqual(
        result.parts.map((part) => part.text),
        [
          'From $6 000 net per month.',
          'From 530 000 ₽ gross per month.',
          'owner@example.test',
          'https://github.com/example-owner',
        ]
      );
      assert.deepEqual(
        result.parts.map((part) => part.question),
        questions
      );
    }
  }
  assert.deepEqual(await store.query(() => true), before);
});

test('assembled questionnaires keep missing contacts and ambiguous salary open without discarding known components', async () => {
  const { store, input, profile } = await setup();
  await saveAnswerProfile(store, {
    ...profile,
    values: { email: profile.values.email },
  });
  const result = await previewAnswer(store, {
    ...input,
    question: questionnaire([
      'What salary in RUB or USD do you expect?',
      ...questions.slice(1),
    ]),
  });
  assert.equal(result.match, 'assembled');
  assert.equal(result.complete, false);
  assert.equal(result.requiresReview, true);
  assert.equal(result.parts.length, 4);
  assert.equal(result.parts[0].complete, false);
  assert.equal(result.parts[1].text, 'From 530 000 ₽ gross per month.');
  assert.equal(result.parts[2].text, 'owner@example.test');
  assert.equal(result.parts[3].complete, false);
  assert.deepEqual(result.parts[3].missing, ['github']);
  assert.ok(result.text.includes('{{github}}'));
});

test('exact saved questionnaires retain priority while assemblies use current profile revisions and frequency-ranked variants', async () => {
  const { store, input, profile } = await setup();
  await saveAnswerRule(store, {
    id: 'assembly-email',
    question: questions[2],
    answers: [
      { text: 'Email {{email}}', approved: true, count: 1 },
      { text: '{{email}}', approved: true, count: 3 },
    ],
  });
  const current = await saveAnswerProfile(store, {
    ...profile,
    values: { ...profile.values, email: 'current@example.test' },
  });
  const assembled = await previewAnswer(store, input);
  assert.equal(assembled.parts[2].text, 'current@example.test');
  assert.equal(assembled.parts[2].count, 3);
  assert.equal(assembled.profileSource.revision, current.revision);
  assert.equal(assembled.requiresReview, true);
  await saveAnswerRule(store, {
    id: 'assembly-whole',
    question: input.question,
    answers: [{ text: 'Owner-approved complete reply.', approved: true }],
  });
  const exact = await previewAnswer(store, input);
  assert.equal(exact.match, 'exact');
  assert.equal(exact.text, 'Owner-approved complete reply.');
  assert.equal(exact.requiresReview, false);
});

test('form questionnaire proposals retain salary components and exact whole answers when a component asks for contacts', async () => {
  const { store, input } = await setup();
  const inspection = formModelInspection([
    formModelField(input.question, {
      id: 'frame-1:questionnaire',
      type: 'textarea',
    }),
  ]);
  const result = await planFormAnswers(store, { ...input, inspection });
  const answer = result.fields[0].answer;
  assert.equal(answer.match, 'assembled');
  assert.equal(answer.parts.length, 4);
  assert.ok(answer.proposal.value.includes('From $6 000 net per month.'));
  assert.ok(answer.proposal.value.includes('From 530 000 ₽ gross per month.'));
  assert.ok(answer.proposal.value.includes('owner@example.test'));
  assert.ok(answer.proposal.value.includes('https://github.com/example-owner'));
  assert.equal(answer.requiresReview, true);
  assert.equal(answer.source, 'assembled');
  assert.deepEqual(answer.profileKeys, []);
  await saveAnswerRule(store, {
    id: 'assembly-whole',
    question: input.question,
    answers: [{ text: 'Owner-approved complete reply.', approved: true }],
  });
  const exact = await planFormAnswers(store, { ...input, inspection });
  assert.equal(exact.fields[0].answer.match, 'exact');
  assert.deepEqual(exact.fields[0].answer.proposal, {
    value: 'Owner-approved complete reply.',
  });
});
