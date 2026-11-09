import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAutomation,
  planAutomation,
} from '../src/automation/automations.js';
import { createMemoryStore } from '../src/storage/index.js';
import {
  createAutomationRunner,
  stillConfirmed,
} from '../src/automation/runner.js';

const rule = (question, text, extra = {}) => ({
  id: 'qa-rule:location',
  question,
  answers: [{ text, count: 2, approved: true }],
  ...extra,
});
const message = (source, id, sender, body, extra = {}) => ({
  id: `msg:${source}:1:${id}`,
  source,
  chat: '1',
  sender,
  body,
  timestamp: `2026-11-09T10:00:0${id}Z`,
  ...extra,
});
const automation = {
  id: 'answer',
  action: { kind: 'answer-questions', profile: { city: 'Nha Trang' } },
  conditions: { mutual: false, cooldownDays: 0 },
};

test('unified answer action plans evidence-backed answers across providers', () => {
  const configured = normalizeAutomation(automation);
  assert.equal(configured.action.kind, 'answer-questions');
  for (const source of ['hh', 'telegram', 'vk', 'email', 'whatsapp']) {
    const plan = planAutomation(
      [
        message(source, 1, 'them', 'Где вы живёте?'),
        rule('Где вы живете?', 'Живу в {{city}}.'),
      ],
      configured,
      { self: ['me'], targets: [{ source, chat: '1' }] }
    );
    assert.equal(plan.drafts.length, 1, source);
    assert.equal(plan.drafts[0].text, 'Живу в Nha Trang.');
    assert.equal(plan.drafts[0].answer.match, 'exact');
    assert.deepEqual(plan.drafts[0].answer.rules, ['qa-rule:location']);
    assert.equal(plan.drafts[0].answer.requiresReview, false);
  }
});

test('bounded templates reject new questions and unrelated intent inside gaps', async () => {
  const { matchQuestion } = await import('../src/automation/question-match.js');
  assert.equal(
    matchQuestion(
      'Расскажите … опыт* разработки',
      'Расскажите ваш опыт разработки'
    ),
    'template'
  );
  for (const text of [
    'Расскажите ваш опыт и когда можем созвониться разработки',
    'Расскажите ваш опыт? Какая зарплата? разработки',
    `Расскажите ${'слово '.repeat(41)}опыт разработки`,
    'Расскажите https://example.test/form опыт разработки',
  ]) {
    assert.equal(matchQuestion('Расскажите … опыт* разработки', text), null);
  }
  assert.equal(matchQuestion('Go', 'Golang'), null);
  assert.equal(matchQuestion('Do you use C++?', 'Do you use C?'), null);
  assert.equal(matchQuestion('Is $5000 suitable?', 'Is €5000 suitable?'), null);
  assert.equal(
    matchQuestion(
      'Расскажите ... опыт* разработки',
      'Расскажите ваш опыт разработки'
    ),
    'template'
  );
});

test('learning retains barriers, rejects private links and requires actual owner identity', async () => {
  const { learnAnswerRules } =
    await import('../src/automation/question-learning.js');
  for (const barrier of [
    message('hh', 2, 'service', undefined, { service: true }),
    message('hh', 2, 'me', 'Когда созвонимся?'),
    message('hh', 2, 'me', 'Ответ', { delivery: 'unknown' }),
    message('hh', 2, 'me', 'Ответ', { deleted: true }),
    message('hh', 2, 'service', undefined, { timestamp: undefined }),
  ]) {
    const learned = learnAnswerRules([
      message('hh', 1, 'them', 'Где вы живете?'),
      barrier,
      message('hh', 3, 'me', 'Другой ответ.'),
    ]);
    assert.deepEqual(learned, [], JSON.stringify(barrier));
  }
  for (const text of [
    'https://t.me/+private-invite',
    'https://example.test/form?signature=private',
    'https://example.test/#secret',
    'tg://resolve?domain=private',
    'https://[broken',
  ]) {
    assert.deepEqual(
      learnAnswerRules([
        message('hh', 1, 'them', 'Пришлите ссылку'),
        message('hh', 2, 'me', text),
      ]),
      [],
      text
    );
  }
  assert.equal(
    learnAnswerRules([
      message('hh', 1, 'them', 'Где вы живете?'),
      message('hh', 2, 'owner-id', 'Вьетнам', { outgoing: true }),
    ]).length,
    1
  );
  assert.equal(
    learnAnswerRules([
      message('hh', 1, 'them', 'Где вы живете?'),
      message('hh', 2, 'somebody', 'Вьетнам'),
    ]).length,
    0
  );
});

test('numbered multi-question answers preserve alignment and incomplete review', async () => {
  const { planAnswer } = await import('../src/automation/question-answers.js');
  const rules = [
    rule('Где вы живете?', '{{city}}'),
    rule('Какой у вас опыт?', 'Пять лет', { id: 'qa-rule:experience' }),
  ];
  const plan = planAnswer('1. Где вы живете?\n2. Какой у вас опыт?', {
    rules,
    profile: { city: 'Nha Trang' },
  });
  assert.equal(plan.text, '1. Nha Trang\n2. Пять лет');
  assert.equal(plan.requiresReview, true);
  assert.equal(plan.match, 'assembled');
  const incomplete = planAnswer('1. Где вы живете?\n2. Какая зарплата?', {
    rules,
  });
  assert.equal(incomplete.requiresReview, true);
  assert.equal(incomplete.complete, false);
  assert.deepEqual(incomplete.missing, ['city']);
  assert.equal(incomplete.parts[1].match, 'unanswered');
});

test('numbered learning never swaps reordered, repeated or unaligned answers', async () => {
  const { splitQuestions } =
    await import('../src/automation/question-match.js');
  const { learnAnswerRules } =
    await import('../src/automation/question-learning.js');
  const question = '1. Где вы живете?\n2. Какой у вас опыт?';
  for (const answer of [
    '2. Пять лет\n1. Вьетнам',
    '1. Вьетнам\n1. Пять лет',
    '1. Вьетнам\n3. Пять лет',
  ]) {
    const learned = learnAnswerRules([
      message('hh', 1, 'them', question),
      message('hh', 2, 'me', answer),
    ]);
    assert.equal(
      learned.length,
      1,
      'retain only the actual whole-message pair'
    );
    assert.equal(learned[0].question, question);
    assert.equal(learned[0].answers[0].text, answer);
  }
  for (const malformed of [
    '2. Где вы живете?\n1. Какой у вас опыт?',
    '1. Где вы живете?\n- Какой у вас опыт?',
    '- Где вы живете?\n• Какой у вас опыт?',
  ]) {
    assert.deepEqual(splitQuestions(malformed), [malformed]);
  }
});

test('choice answers require a unique exact option and scoped rules', async () => {
  const { planAnswer } = await import('../src/automation/question-answers.js');
  const options = {
    rules: [rule('Где вы живете?', 'Вьетнам')],
    options: ['РФ', 'Вьетнам'],
  };
  assert.equal(planAnswer('Где вы живете?', options).text, 'Вьетнам');
  assert.equal(
    planAnswer('Где вы живете?', { ...options, options: ['РФ'] }).complete,
    false
  );
  assert.equal(
    planAnswer('Где вы живете?', {
      ...options,
      options: ['Вьетнам', 'вьетнам'],
    }).complete,
    false
  );
  assert.equal(
    planAnswer('Где вы живете?', {
      rules: [rule('Где вы живете?', 'Вьетнам', { sources: ['hh'] })],
      source: 'telegram',
    }).match,
    'unanswered'
  );
});

test('learning counts unique actual outgoing answers and preserves turns', async () => {
  const { learnAnswerRules } =
    await import('../src/automation/question-learning.js');
  const messages = [
    message('hh', 1, 'them', 'Какой у вас опыт?'),
    message('hh', 2, 'me', 'Пять лет.'),
    message('hh', 3, 'me', 'В распределенных командах.'),
    message('hh', 4, 'them', 'Спасибо!'),
    message('hh', 5, 'me', 'Пожалуйста.'),
    message('vk', 1, 'them', 'Какой у вас опыт?'),
    message('vk', 2, 'me', 'Пять лет.\nВ распределенных командах.'),
  ];
  const learned = learnAnswerRules([...messages, messages[1]], {
    self: ['me'],
  });
  assert.equal(learned.length, 1);
  assert.equal(learned[0].answers[0].count, 2);
  assert.equal(learned[0].answers[0].approved, false);
  assert.deepEqual(learned[0].answers[0].evidence, [
    'msg:hh:1:2',
    'msg:hh:1:3',
    'msg:vk:1:2',
  ]);
  assert.equal(
    learnAnswerRules(
      [
        message('hh', 1, 'them', 'Какой у вас опыт?'),
        message('hh', 2, 'them', 'Новая тема.'),
        message('hh', 3, 'me', 'Другое.'),
      ],
      { self: ['me'] }
    ).length,
    0
  );
});

test('unapproved answers pause automatic delivery, retain a draft and need explicit review', async () => {
  const store = createMemoryStore();
  const source = 'hh';
  for (const link of [
    message(source, 1, 'them', 'Где вы живете?'),
    rule('Где вы живете?', 'Вьетнам', {
      answers: [{ text: 'Вьетнам', count: 2, approved: false }],
    }),
    normalizeAutomation(automation),
  ]) {
    await store.put(link);
  }
  const sent = [];
  const runner = createAutomationRunner({
    store,
    self: ['me'],
    sleep: async () => {},
    send: async (draft) => {
      sent.push(draft);
      return { status: 'sent' };
    },
  });
  const options = { targets: [{ source, chat: '1' }] };
  const plan = await runner.plan(await runner.load('answer'), options);
  const outcome = await runner.deliverDraft('answer', plan.drafts[0]);
  assert.equal(outcome.code, 'answer-review-required');
  assert.equal(sent.length, 0);
  assert.equal((await runner.drafts({})).length, 1);
  const reviewed = await runner.sendDraft(plan.drafts[0].id, { confirm: true });
  assert.equal(reviewed.status, 'sent');
  assert.equal(sent.length, 1);
});

test('confirmation and deduplication belong to the actual question, not just its text', async () => {
  const draft = {
    source: 'hh',
    chat: '1',
    text: 'Вьетнам',
    answer: { message: 'msg:hh:1:1' },
  };
  assert.equal(
    stillConfirmed([{ ...draft, answer: { message: 'msg:hh:1:2' } }], [draft])
      .length,
    0
  );
  const source = 'hh';
  const store = createMemoryStore();
  const configured = normalizeAutomation({
    ...automation,
    pacing: { typing: false },
  });
  await store.put(configured);
  await store.put(rule('Где вы живете?', 'Вьетнам'));
  await store.put(message(source, 1, 'them', 'Где вы живете?'));
  let sent = 0;
  const runner = createAutomationRunner({
    store,
    self: ['me'],
    send: async () => {
      sent++;
      return { status: 'sent' };
    },
  });
  const plan = await runner.plan(configured, {
    targets: [{ source, chat: '1' }],
  });
  const first = await runner.deliverDraft(configured, plan.drafts[0]);
  assert.equal(first.status, 'sent');
  const repeated = await runner.deliverDraft(configured, plan.drafts[0]);
  assert.notEqual(repeated.status, 'sent');
  assert.equal(sent, 1);
});

test('automatic sends recheck the latest turn and current approval', async () => {
  for (const change of [
    'new-question',
    'edited-question',
    'owner-reply',
    'revoked',
    'changed-answer',
    'service',
    'rejected-policy',
  ]) {
    const store = createMemoryStore();
    const configured = normalizeAutomation({
      ...automation,
      pacing: { typing: false },
    });
    const original = message('hh', 1, 'them', 'Где вы живете?');
    await store.put(configured);
    await store.put(rule(original.body, 'Вьетнам'));
    await store.put(original);
    let sent = 0;
    const runner = createAutomationRunner({
      store,
      self: ['me'],
      send: async () => {
        sent++;
        return { status: 'sent' };
      },
    });
    const plan = await runner.plan(configured, {
      targets: [{ source: 'hh', chat: '1' }],
    });
    assert.equal(plan.drafts.length, 1);
    if (change === 'new-question') {
      await store.put(message('hh', 2, 'them', 'Какой у вас опыт?'));
    }
    if (change === 'edited-question') {
      await store.put({ ...original, body: 'Где вы работаете?' });
    }
    if (change === 'owner-reply') {
      await store.put(message('hh', 2, 'me', 'Уже ответил.'));
    }
    if (change === 'revoked') {
      await store.put(
        rule(original.body, 'Вьетнам', {
          answers: [{ text: 'Вьетнам', approved: false }],
        })
      );
    }
    if (change === 'changed-answer') {
      await store.put(rule(original.body, 'Другой ответ'));
    }
    if (change === 'service') {
      await store.put(message('hh', 2, 'service', '', { service: true }));
    }
    if (change === 'rejected-policy') {
      await store.put({ id: 'qa-policy:reuse', rejected: ['Вьетнам'] });
    }
    const outcome = await runner.deliverDraft(configured, plan.drafts[0]);
    assert.equal(outcome.status, 'failed', change);
    assert.equal(sent, 0, change);
  }
});

test('planning never jumps over an unusable latest turn', () => {
  for (const barrier of [
    message('hh', 2, 'service', '', { service: true }),
    message('hh', 2, 'them', 'Gone?', { deleted: true }),
    message('hh', 2, 'them', 'Спасибо'),
    message('hh', 2, 'service', '', { timestamp: undefined }),
    message('hh', 2, 'owner', 'Где вы живете?', { outgoing: true }),
  ]) {
    const plan = planAutomation(
      [
        message('hh', 1, 'them', 'Где вы живете?'),
        barrier,
        rule('Где вы живете?', 'Вьетнам'),
      ],
      automation,
      { self: ['me'], targets: [{ source: 'hh', chat: '1' }] }
    );
    assert.equal(plan.drafts.length, 0);
  }
});

test('questions arriving during typing stop delivery without an outbox claim', async () => {
  const store = createMemoryStore();
  const configured = normalizeAutomation(automation);
  await store.put(configured);
  await store.put(message('hh', 1, 'them', 'Где вы живете?'));
  await store.put(rule('Где вы живете?', 'Вьетнам'));
  let sent = 0;
  const events = [];
  const runner = createAutomationRunner({
    store,
    self: ['me'],
    sleep: async () => store.put(message('hh', 2, 'them', 'Какая зарплата?')),
    send: async () => {
      sent++;
      return { status: 'sent' };
    },
    log: (event) => events.push(event),
  });
  const plan = await runner.plan(configured, {
    targets: [{ source: 'hh', chat: '1' }],
  });
  const outcome = await runner.deliverDraft(configured, plan.drafts[0]);
  assert.equal(outcome.code, 'answer-changed');
  assert.equal(sent, 0);
  assert.equal(
    (await store.query((link) => link.id?.startsWith('outbox:'))).length,
    0
  );
  assert.equal(events[0].event, 'automation_answer_invalidated');
});
