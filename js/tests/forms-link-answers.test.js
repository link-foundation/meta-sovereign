import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { saveAnswerProfile } from '../src/automation/question-profiles.js';
import { saveAnswerRule } from '../src/automation/question-store.js';
import { planFormAnswers } from '../src/forms/answer-plan.js';
import { proposalFor } from '../src/forms/proposals.js';
import { seedModelAnswers } from '../../experiments/issue-56/forms-model-fixture.mjs';
import {
  formModelField as field,
  formModelInspection as inspection,
} from './helpers/forms-plan-inspection.mjs';

const links = {
  resume: 'https://hh.ru/resume/synthetic-owner',
  website: 'https://portfolio.example.test/ada',
  github: 'https://github.com/synthetic-owner',
};
const plan = (store, fields, extra = {}) =>
  planFormAnswers(store, { inspection: inspection(fields), ...extra });
const save = (store, question, text) =>
  saveAnswerRule(store, {
    id: question,
    question,
    answers: [{ text, approved: true, count: 1 }],
  });

test('generic link requests also require a URL without inventing a contact subject', () => {
  for (const label of ['Link to your work', 'URL', 'Ссылка', 'लिंक', '链接']) {
    assert.equal(
      proposalFor(field(label), { text: 'Yes', complete: true }, []),
      null
    );
    assert.deepEqual(
      proposalFor(field(label), { text: links.website, complete: true }, []),
      { value: links.website }
    );
  }
  assert.deepEqual(
    proposalFor(
      field('Do you have a portfolio link?'),
      { text: 'Yes', complete: true },
      []
    ),
    { value: 'Yes' }
  );
});

test('a link request cannot reuse saved boolean wording without an owner profile', async () => {
  const store = createMemoryStore();
  const labels = [
    'GitHub',
    'LinkedIn profile',
    'Ссылка на резюме',
    'Резюме, портфолио или профиль',
  ];
  for (const label of labels) {
    await save(store, label, 'No');
  }
  const before = JSON.stringify(await store.query(() => true));
  const result = await plan(
    store,
    labels.map((label) => field(label))
  );
  assert(result.fields.every((entry) => entry.answer.proposal === null));
  assert(
    result.fields.every((entry) => entry.answer.reason === 'field-format')
  );
  assert.equal(JSON.stringify(await store.query(() => true)), before);
});

test('specific contact requests route only their links and a combined request includes all available links', async () => {
  const store = createMemoryStore();
  const profile = await saveAnswerProfile(store, {
    id: 'links',
    name: 'Owner',
    values: links,
  });
  await save(store, 'LinkedIn profile', 'Yes');
  const result = await plan(
    store,
    [
      field('Ссылка на резюме'),
      field('GitHub'),
      field('LinkedIn profile'),
      field('Резюме, портфолио или профиль', { value: 'Owner keeps this' }),
    ],
    { profileId: profile.id }
  );
  const [resume, github, linkedin, combined] = result.fields.map(
    (entry) => entry.answer
  );
  assert.deepEqual(resume.proposal, { value: links.resume });
  assert.deepEqual(github.proposal, { value: links.github });
  assert.equal(linkedin.proposal, null);
  assert.deepEqual(linkedin.missing, ['linkedin']);
  assert.deepEqual(combined.proposal, {
    value: Object.values(links).join(', '),
  });
  assert.equal(combined.preserveCurrent, true);
  assert.equal(combined.requiresReview, true);
});

test('combined link requests remain missing when the selected owner has no links', async () => {
  const store = createMemoryStore();
  await save(store, 'Резюме, портфолио или профиль', 'Yes');
  const result = await plan(store, [field('Резюме, портфолио или профиль')], {
    profile: { name: 'Owner' },
  });
  assert.equal(result.fields[0].answer.proposal, null);
  assert.equal(result.fields[0].answer.reason, 'missing-profile');
});

test('saved and model link proposals reject wrong providers, credentials and misleading hosts', () => {
  for (const source of ['exact', 'model']) {
    for (const [label, text] of [
      ['LinkedIn profile', links.github],
      ['GitHub', 'https://github.com.attacker.test/name'],
      ['GitHub', 'https://github.com@attacker.test/name'],
      ['GitHub', 'https://attacker.test/github.com'],
      ['GitHub', 'javascript:alert(1)'],
      ['GitHub', 'No'],
      ['LinkedIn URL', 'https://linkedin.com.attacker.test/in/name'],
      ['Resume link', 'Yes'],
      ['Portfolio', 'No'],
    ]) {
      assert.equal(
        proposalFor(field(label), { source, text, complete: true }, []),
        null,
        `${source}: ${label}: ${text}`
      );
    }
  }
});

test('valid saved links remain usable without a profile, including multiple GitHub links', async () => {
  const store = createMemoryStore();
  const github = `${links.github}\nhttps://gist.github.com/synthetic-owner/example`;
  await save(store, 'GitHub', github);
  await save(
    store,
    'LinkedIn profile',
    'https://www.linkedin.com/in/synthetic-owner'
  );
  const result = await plan(store, [
    field('GitHub'),
    field('LinkedIn profile'),
  ]);
  assert.deepEqual(
    result.fields.map((entry) => entry.answer.proposal.value),
    [github, 'https://www.linkedin.com/in/synthetic-owner']
  );
});

test('boolean questions, ordinary contact answers and GitHub experience keep their saved semantics', async () => {
  const store = createMemoryStore();
  await save(store, 'GitHub', 'No');
  await save(store, 'Have you used LinkedIn?', 'Yes');
  await save(store, 'GitHub experience', 'Reviewed five years of work');
  await save(store, 'Email', 'reviewed@example.test');
  const result = await plan(store, [
    field('GitHub', { type: 'checkbox' }),
    field('Have you used LinkedIn?'),
    field('GitHub experience'),
    field('Email', { type: 'email' }),
  ]);
  assert.deepEqual(
    result.fields.map((entry) => entry.answer.proposal),
    [
      { checked: false },
      { value: 'Yes' },
      { value: 'Reviewed five years of work' },
      { value: 'reviewed@example.test' },
    ]
  );
});

test('link labels in the four supported languages use the requested contact subject', async () => {
  const store = createMemoryStore();
  const fields = [
    'Link to your résumé',
    'Ссылка на резюме',
    'सीवी लिंक',
    '简历链接',
  ].map((label) => field(label));
  const result = await plan(store, fields, { profile: links });
  assert(
    result.fields.every(
      (entry) => entry.answer.proposal?.value === links.resume
    )
  );
  const portfolio = await plan(store, [field('Your website or portfolio')], {
    profile: links,
  });
  assert.equal(portfolio.fields[0].answer.proposal.value, links.website);
});

test(
  'the optional model cannot turn an unresolved link request into a boolean or another provider',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    await seedModelAnswers(store);
    const fields = [field('GitHub'), field('LinkedIn profile')];
    let calls = 0;
    const result = await planFormAnswers(
      store,
      {
        inspection: inspection(fields),
        modelDraft: true,
        approximate: false,
      },
      {
        runner: async () => {
          calls++;
          return {
            drafts: fields.map((entry, index) => ({
              id: entry.id,
              text: index ? links.github : 'No',
              missing: [],
              evidence: ['cv:model-fixture'],
            })),
          };
        },
      }
    );
    assert.equal(calls, 1);
    assert(result.fields.every((entry) => entry.answer.source === 'model'));
    assert(
      result.fields.every(
        (entry) =>
          entry.answer.proposal === null &&
          entry.answer.reason === 'field-format'
      )
    );
  }
);
