import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';
import {
  normalizeAutomation,
  planAutomation,
} from '../src/automation/automations.js';
import { createMemoryStore } from '../src/storage/index.js';
import { createAutomationRunner } from '../src/automation/runner.js';

const contexts = [
  {
    key: 'currency',
    default: 'RUB',
    choices: [
      {
        id: 'RUB',
        keywords: ['RUB', 'рублях'],
        profile: { salary: '450000 ₽', gross: '530000 ₽' },
      },
      {
        id: 'USD',
        keywords: ['USD', 'долларах'],
        profile: { salary: '$6000' },
      },
      {
        id: 'USDT',
        keywords: ['USDT', 'blockchain'],
        profile: { salary: '6000 USDT' },
      },
    ],
  },
];
const rule = {
  id: 'qa-rule:salary',
  question: 'What salary …?',
  answers: [{ text: '{{salary}} in {{currency}}', approved: true, count: 3 }],
};
const options = { rules: [rule], contexts, profile: { city: 'Hanoi' } };
const incoming = (id, body, extra = {}) => ({
  id: `msg:hh:1:${id}`,
  source: 'hh',
  chat: '1',
  sender: 'them',
  body,
  timestamp: `2026-11-09T10:00:0${id}Z`,
  ...extra,
});
const configured = () =>
  normalizeAutomation({
    id: 'contextual',
    action: { kind: 'answer-questions', contexts },
    conditions: { mutual: false, cooldownDays: 0 },
    pacing: { typing: false },
  });

test('configured context values follow question, conversation, pay card, description and default', () => {
  const input = {
    ...options,
    recent: [{ text: 'We pay in RUB.' }],
    vacancy: { pay: 'USDT', description: 'USD vacancy' },
  };
  assert.equal(planAnswer('What salary in USD?', input).text, '$6000 in USD');
  assert.equal(
    planAnswer('What salary expectations?', input).text,
    '450000 ₽ in RUB'
  );
  assert.equal(
    planAnswer('What salary expectations?', { ...input, recent: [] }).text,
    '6000 USDT in USDT'
  );
  assert.equal(
    planAnswer('What salary expectations?', {
      ...options,
      vacancy: { description: 'USD vacancy' },
    }).text,
    '$6000 in USD'
  );
  assert.equal(
    planAnswer('What salary expectations?', options).text,
    '450000 ₽ in RUB'
  );
  assert.equal(
    planAnswer('What salary in USDT?', options).text,
    '6000 USDT in USDT'
  );
  assert.equal(
    planAnswer('What salary for cryptography?', options).text,
    '450000 ₽ in RUB'
  );
});

test('context switching clears unavailable fields and ambiguity needs evidence', () => {
  const gross = {
    ...options,
    profile: { gross: 'stale ruble amount' },
    rules: [{ ...rule, answers: [{ text: '{{gross}}', approved: true }] }],
  };
  const missing = planAnswer('What salary in USD?', gross);
  assert.equal(missing.complete, false);
  assert.deepEqual(missing.missing, ['gross']);
  const ambiguous = planAnswer('What salary in RUB or USD?', {
    ...options,
    contexts: contexts.map((group) => ({ ...group, default: null })),
  });
  assert.equal(ambiguous.requiresReview, true);
  assert.equal(ambiguous.complete, false);
  const known = planAnswer('What salary in RUB or USD?', {
    ...options,
    vacancy: { pay: 'USD' },
  });
  assert.equal(known.text, '$6000 in USD');
  assert.equal(known.contexts[0].source, 'vacancy-pay');
  const conflictingHistory = planAnswer('What salary expectations?', {
    ...options,
    recent: [{ text: 'We offer RUB or USD.' }],
  });
  assert.equal(conflictingHistory.complete, false);
  assert.equal(conflictingHistory.contexts[0].source, 'ambiguous');
  assert.equal(
    planAnswer('What salary expectations?', {
      ...options,
      recent: [{ text: 'We offer RUB or USD.' }],
      vacancy: { pay: 'USD' },
    }).text,
    '$6000 in USD'
  );
});

test('context templates span only configured variable choices and retain literal subjects', () => {
  const asked = 'What salary in USD?';
  assert.equal(
    planAnswer(asked, { ...options, contexts: [] }).match,
    'unanswered'
  );
  assert.equal(
    planAnswer(asked, {
      ...options,
      rules: [{ ...rule, answers: [{ text: '450000 ₽', approved: true }] }],
    }).match,
    'unanswered'
  );
  assert.equal(
    planAnswer('What salary in RUB?', {
      ...options,
      rules: [{ ...rule, question: 'What salary in USD …?' }],
    }).match,
    'unanswered'
  );
  const corrected = {
    ...rule,
    answers: [
      { text: '{{salary}} in {{currency}}', approved: true, canonical: true },
    ],
  };
  assert.equal(
    planAnswer(asked, { ...options, rules: [corrected] }).text,
    '$6000 in USD'
  );
});

test('conversation context is chat scoped and stops at unrelated questions and unusable turns', () => {
  for (const source of ['hh', 'telegram', 'vk', 'email', 'whatsapp']) {
    const messages = [
      incoming(1, 'We pay in USD.'),
      incoming(2, 'What salary expectations?'),
    ].map((message) => ({
      ...message,
      source,
      id: message.id.replace(':hh:', `:${source}:`),
    }));
    const plan = planAutomation([...messages, rule], configured(), {
      self: ['me'],
      targets: [{ source, chat: '1' }],
    });
    assert.equal(plan.drafts[0]?.text, '$6000 in USD', source);
    assert.equal(plan.drafts[0].answer.contexts[0].evidence, messages[0].id);
  }
  for (const barrier of [
    incoming(2, 'What stack do you use?'),
    incoming(2, 'USD', { service: true }),
    incoming(2, 'USD', { deleted: true }),
    incoming(2, 'USD', { pending: true }),
  ]) {
    const plan = planAutomation(
      [
        incoming(1, 'We pay in USD.'),
        barrier,
        incoming(3, 'What salary expectations?'),
        rule,
      ],
      configured(),
      { self: ['me'], targets: [{ source: 'hh', chat: '1' }] }
    );
    assert.equal(plan.drafts[0]?.text, '450000 ₽ in RUB');
  }
  const plan = planAutomation(
    [
      incoming(1, 'We pay in USD.', { chat: 'other' }),
      incoming(2, 'What salary expectations?'),
      rule,
    ],
    configured(),
    { self: ['me'], targets: [{ source: 'hh', chat: '1' }] }
  );
  assert.equal(plan.drafts[0]?.text, '450000 ₽ in RUB');
});

const verifyChangedContext = async (change) => {
  const store = createMemoryStore();
  const previous = incoming(1, 'We pay in USD.');
  const latest = incoming(2, 'What salary expectations?');
  const automation = configured();
  automation.pacing.typing = true;
  for (const link of [previous, latest, rule, automation]) {
    await store.put(link);
  }
  let sent = 0;
  const runner = createAutomationRunner({
    store,
    self: ['me'],
    sleep: async () => change(store, { previous, latest, automation }),
    send: async () => {
      sent++;
      return { status: 'sent' };
    },
  });
  const plan = await runner.plan(automation, {
    targets: [{ source: 'hh', chat: '1' }],
  });
  assert.equal(plan.drafts[0]?.text, '$6000 in USD');
  const outcome = await runner.deliverDraft(automation, plan.drafts[0]);
  assert.equal(outcome.code, 'answer-review-required');
  assert.equal(sent, 0);
  assert.deepEqual(
    await store.query((link) => link.id?.startsWith('outbox:')),
    []
  );
};

test('context and saved action edits during typing invalidate delivery before an outbox claim', async () => {
  for (const change of [
    (store, { previous }) => store.put({ ...previous, body: 'We pay in RUB.' }),
    (store, { automation }) => store.put({ ...automation, enabled: false }),
    (store, { automation }) => store.delete(automation.id),
    (store, { automation }) =>
      store.put({ ...automation, action: { kind: 'send-template' } }),
    (store, { automation }) =>
      store.put({
        ...automation,
        action: { ...automation.action, profile: {}, contexts: [] },
      }),
    // A new vacancy attachment supplies the only currency evidence.
    (store, { latest, previous }) =>
      Promise.all([
        store.put({ ...previous, body: 'The pay details are attached.' }),
        store.put({ ...latest, answerContext: { pay: 'USDT' } }),
      ]),
  ]) {
    await verifyChangedContext(change);
  }
});

test('arbitrary context groups select independently and never leak values across choices', () => {
  const work = {
    key: 'format',
    default: 'remote',
    choices: [
      {
        id: 'office',
        keywords: ['office', 'on site'],
        profile: { format: 'in the office' },
      },
      { id: 'remote', keywords: ['remote'], profile: { format: 'remotely' } },
    ],
  };
  const rules = [
    {
      ...rule,
      question: 'Can you work …?',
      answers: [{ text: 'I can work {{format}}.', approved: true }],
    },
  ];
  const result = planAnswer('Can you work in the office or remote?', {
    contexts: [work],
    rules,
    vacancy: { description: 'This is an on site role.' },
  });
  assert.equal(result.text, 'I can work in the office.');
  assert.equal(result.contexts[0].source, 'vacancy-description');
  assert.equal(result.requiresReview, false);
  const ambiguous = planAnswer('Can you work in the office or remote?', {
    contexts: [work],
    rules,
  });
  assert.equal(ambiguous.complete, false);
  assert.equal(ambiguous.requiresReview, true);
  assert.equal(ambiguous.contexts[0].source, 'ambiguous');
});

test('context validation rejects overlapping fields, duplicate choices and malformed defaults', () => {
  const action = (groups) => ({
    action: { kind: 'answer-questions', contexts: groups },
  });
  assert.equal(
    configured().action.contexts[0].choices[1].profile.salary,
    '$6000'
  );
  for (const groups of [
    [...contexts, ...contexts],
    contexts.map((group) => ({ ...group, default: 'EUR' })),
    contexts.map((group) => ({
      ...group,
      choices: [...group.choices, group.choices[0]],
    })),
    contexts.map((group) => ({
      ...group,
      choices: [{ id: 'USD', keywords: ['...'], profile: {} }],
    })),
    [
      ...contexts,
      {
        key: 'format',
        choices: [
          {
            id: 'remote',
            keywords: ['remote'],
            profile: { salary: 'wrong group' },
          },
        ],
      },
    ],
    contexts.map((group) => ({
      ...group,
      choices: [{ id: 'USD', keywords: ['USD'], profile: { salary: 6000 } }],
    })),
  ]) {
    assert.throws(
      () => normalizeAutomation(action(groups)),
      /context|profile/u
    );
  }
  assert.throws(
    () =>
      normalizeAutomation(
        action([
          {
            key: 'example',
            choices: [
              {
                id: 'value',
                keywords: ['value'],
                profile: Object.fromEntries(
                  Array.from({ length: 40 }, (_, index) => [
                    `field${index}`,
                    'я'.repeat(2000),
                  ])
                ),
              },
            ],
          },
        ])
      ),
    /128 KiB/u
  );
});

test('history is bounded, ordered and never uses old, failed or foreign metadata', () => {
  const latest = incoming(3, 'What salary expectations?');
  const run = (messages) =>
    planAutomation([...messages, latest, rule], configured(), {
      self: ['me'],
      targets: [{ source: 'hh', chat: '1' }],
    }).drafts[0];
  assert.equal(
    run([incoming(1, 'We pay in USD.', { timestamp: '2026-11-07T10:00:01Z' })])
      .text,
    '450000 ₽ in RUB'
  );
  assert.equal(
    run([
      incoming(1, 'We pay in USD.'),
      incoming(2, 'Unknown delivery', { delivery: 'unknown' }),
    ]).text,
    '450000 ₽ in RUB'
  );
  assert.equal(
    run([incoming(2, 'We pay in USD.'), incoming(1, 'We pay in RUB.')]).text,
    '$6000 in USD'
  );
  assert.equal(
    run([incoming(1, 'We pay in USD.', { source: 'telegram' })]).text,
    '450000 ₽ in RUB'
  );
  const vacancyPlan = planAutomation(
    [
      { ...latest, answerContext: { pay: 'USDT', evidence: 'vacancy:hh:12' } },
      rule,
    ],
    configured(),
    { self: ['me'], targets: [{ source: 'hh', chat: '1' }] }
  ).drafts[0];
  assert.equal(vacancyPlan.text, '6000 USDT in USDT');
  assert.equal(vacancyPlan.answer.contexts[0].evidence, 'vacancy:hh:12');
});
