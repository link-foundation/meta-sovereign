import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';
import { questionWatchFixture } from '../../experiments/issue-56/question-watch-fixture.mjs';
import {
  normalizeAutomation,
  planAutomation,
} from '../src/automation/automations.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { createAutomationRunner } from '../src/automation/runner.js';
import { createAcceptedSummaryIndex } from '../src/automation/question-summary-choice.js';
import { summaryChoiceMessage } from '../../experiments/issue-56/summary-choice-fixture.mjs';

const question = 'Do you have distributed systems experience?';
const options = {
  rules: [
    {
      id: 'qa-rule:experience',
      question,
      answers: [{ text: 'Yes', approved: true, count: 7 }],
    },
  ],
  options: ['Yes', 'No'],
  strictOptions: true,
};
const recent = [
  { text: 'YES.', outgoing: true, evidence: 'reply' },
  { text: question, evidence: 'previous-question' },
];

test('a repeated question after the same sent wording requires review without changing knowledge', () => {
  const before = globalThis.structuredClone(options);
  const answer = planAnswer(question, { ...options, recent });
  assert.equal(answer.requiresReview, true);
  assert.equal(answer.option, 'Yes');
  assert.equal(answer.count, 7);
  assert.deepEqual(options, before);
});

test('repetition needs a matching sent answer and the immediately preceding incoming question', () => {
  for (const history of [
    [],
    [recent[1]],
    [{ ...recent[0], text: 'No' }, recent[1]],
    [recent[0], { text: 'When can you start?' }, recent[1]],
    [{ text: 'New incoming message' }, ...recent],
  ]) {
    assert.equal(
      planAnswer(question, { ...options, recent: history }).requiresReview,
      false
    );
  }
  const answer = planAnswer(question, {
    ...options,
    questionMode: 'field',
    recent,
  });
  assert.equal(answer.requiresReview, false);
});

test('sent wording is held in free text and across consecutive replies, while a different accepted option remains usable', () => {
  const free = { ...options, options: [], strictOptions: false, recent };
  assert.equal(planAnswer(question, free).requiresReview, true);
  assert.equal(
    planAnswer(question, {
      ...options,
      recent: [{ text: 'Thank you.', outgoing: true }, ...recent],
    }).requiresReview,
    true
  );
  for (const text of ['Yes', 'No']) {
    const index = createAcceptedSummaryIndex();
    index.accept(
      summaryChoiceMessage({ body: `Your answers:\n${question}: ${text}.` })
    );
    const answer = planAnswer(question, {
      ...options,
      rules: [],
      recent,
      acceptedSummaries: index.snapshot(),
    });
    assert.equal(answer.option, text);
    assert.equal(answer.requiresReview, text === 'Yes');
  }
});

const automation = normalizeAutomation({
  id: 'repeated-question',
  action: { kind: 'answer-questions' },
  conditions: { mutual: false, cooldownDays: 0 },
});
const archive = (source, identity, reply = 'Yes') =>
  [question, reply, question].map((body, i) => ({
    id: `msg:${source}:1:${i + 1}`,
    source,
    chat: '1',
    sender: i === 1 ? 'owner' : 'employer',
    body,
    timestamp: `2026-11-11T10:00:0${i}Z`,
    ...(i === 1 ? identity : {}),
  }));
const target = (source) => ({ self: ['42'], targets: [{ source, chat: '1' }] });

test('archived repetition uses the same owner identity as turn selection across providers', () => {
  for (const source of ['hh', 'telegram', 'vk', 'email', 'whatsapp']) {
    for (const identity of [
      { out: true },
      { outgoing: true },
      { sender: 'me' },
      { sender: 42 },
    ]) {
      const plan = planAutomation(
        [...options.rules, ...archive(source, identity)],
        automation,
        target(source)
      );
      assert.equal(
        plan.drafts.length,
        1,
        `${source} ${JSON.stringify(identity)}`
      );
      assert.equal(plan.drafts[0].answer.requiresReview, true);
      assert.equal(plan.drafts[0].text, 'Yes');
    }
  }
});

test('fresh dispatch holds a now-repeated answer without sending or changing rule counts', async () => {
  const store = createMemoryStore();
  const messages = archive('hh', { sender: 42 }, 'No');
  await store.putMany([automation, ...options.rules, ...messages]);
  const sent = [];
  const runner = createAutomationRunner({
    store,
    self: ['42'],
    sleep: async () => {},
    send: async (draft) => {
      sent.push(draft);
      return { status: 'sent' };
    },
  });
  const plan = await runner.plan(automation, target('hh'));
  const draft = plan.drafts[0];
  assert.equal(draft.answer.requiresReview, false);
  await store.put({ ...messages[1], body: 'Yes' });
  const result = await runner.deliverDraft(automation.id, draft);
  assert.equal(result.code, 'answer-review-required');
  assert.equal(sent.length, 0);
  assert.equal((await store.get(options.rules[0].id)).answers[0].count, 7);
});

test(
  'the current-chat watcher refuses another choice after a repeated native question',
  { timeout: 5000 },
  async () => {
    const env = await questionWatchFixture();
    const last = env.state.snapshot.question;
    env.state.snapshot.messages = [
      {
        id: '99',
        body: last.body,
        outgoing: false,
        timestamp: '2026-11-11T09:59:00Z',
      },
      {
        id: '100',
        body: 'Yes',
        outgoing: true,
        timestamp: '2026-11-11T09:59:30Z',
      },
      { ...last, timestamp: '2026-11-11T10:00:00Z' },
    ];
    try {
      env.input.review = (await env.browser.inspect(env.review.target)).id;
      await env.browser.watchStart(env.input);
      const state = await env.until((value) => value.phase === 'review');
      assert.equal(state.last.plan.requiresReview, true);
      assert.equal(env.state.sends.length, 0);
      assert.equal(env.state.prefills.length, 0);
    } finally {
      await env.browser.close();
    }
  }
);
