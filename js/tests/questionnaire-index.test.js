import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  normalizeAnswerRule,
  planAnswer,
} from '../src/automation/question-answers.js';
import { indexQuestionnaireRules } from '../src/automation/questionnaire-index.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { startServer } from '../src/server/index.js';
import {
  encodeWire,
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';
import {
  learnSavedAnswers,
  listAnswerRules,
  previewAnswer,
  saveAnswerRule,
} from '../src/automation/question-store.js';

const questions = ['Which languages do you use?', 'Where do you live?'];
const question = questions.map((part, i) => `${i + 1}. ${part}`).join('\n');
const whole = {
  id: 'qa-rule:existing-questionnaire',
  question,
  answers: [{ text: '1. Python.\n2. Hanoi.', count: 0, approved: true }],
};

test('existing whole questionnaires expose reviewable components in every shared planner context', async () => {
  const store = createMemoryStore();
  await saveAnswerRule(store, whole);
  const snapshot = await listAnswerRules(store);
  for (const source of ['hh', 'telegram', 'vk', 'email', 'whatsapp']) {
    for (const questionMode of [undefined, 'field']) {
      const input = {
        question: questions[1],
        source,
        chat: '1',
        questionMode,
        approximate: false,
      };
      const answer = await previewAnswer(store, input);
      assert.equal(answer.text, 'Hanoi.', `${source}/${questionMode}`);
      assert.equal(answer.match, 'exact');
      assert.equal(answer.requiresReview, true);
      assert.equal(answer.count, 0);
      assert.deepEqual(answer.rules, [whole.id]);
    }
  }
  const exact = await previewAnswer(store, { question, approximate: false });
  assert.equal(exact.text, whole.answers[0].text);
  assert.equal(exact.requiresReview, false);
  assert.deepEqual(await listAnswerRules(store), snapshot);
});

test('offline backfill proposes saved-only components without observed uses or approval', async () => {
  const store = createMemoryStore();
  await saveAnswerRule(store, whole);
  const before = await listAnswerRules(store);
  const preview = await learnSavedAnswers(store);
  assert.equal(preview.coverage.seen, 0);
  assert.equal(preview.rules.length, 2);
  for (const rule of preview.rules) {
    assert(questions.includes(rule.question));
    assert.equal(rule.answers[0].count, 0);
    assert.equal(rule.answers[0].approved, false);
    assert.equal(rule.answers[0].canonical, false);
    assert.deepEqual(rule.answers[0].evidence, []);
  }
  assert.deepEqual(await listAnswerRules(store), before);
  await learnSavedAnswers(store, { apply: true });
  const applied = await listAnswerRules(store);
  assert.equal(applied.length, 3);
  assert.deepEqual(
    applied.find((rule) => rule.id === whole.id),
    before[0]
  );
  await learnSavedAnswers(store, { apply: true });
  assert.deepEqual(await listAnswerRules(store), applied);
});

test('aligned component reuse preserves source scope, corrections and ambiguous whole replies', () => {
  const scoped = { ...whole, sources: ['hh'], chats: ['hh:1'] };
  const options = { rules: [scoped], approximate: false };
  assert.equal(planAnswer(questions[1], options).match, 'unanswered');
  assert.equal(
    planAnswer(questions[1], { ...options, source: 'hh', chat: '1' }).text,
    'Hanoi.'
  );
  for (const input of [
    { source: 'vk', chat: '1' },
    { source: 'hh', chat: '2' },
  ]) {
    assert.equal(
      planAnswer(questions[1], { ...options, ...input }).match,
      'unanswered'
    );
  }
  const corrected = planAnswer(questions[1], {
    ...options,
    source: 'hh',
    chat: '1',
    rules: [
      scoped,
      {
        id: 'qa-rule:corrected-city',
        question: questions[1],
        answers: [{ text: 'Da Nang.', canonical: true, approved: true }],
      },
    ],
  });
  assert.equal(corrected.text, 'Da Nang.');
  assert.equal(corrected.requiresReview, false);
  for (const answers of [
    [{ text: '1. Python.\n3. Hanoi.' }],
    [{ text: '- Python.\n- Hanoi.' }],
    [{ text: 'Python and Hanoi.' }],
  ]) {
    assert.equal(
      planAnswer(questions[1], {
        rules: [{ ...whole, answers }],
        approximate: false,
      }).match,
      'unanswered'
    );
  }
  assert.equal(
    planAnswer(questions[1], {
      rules: [{ ...whole, enabled: false }],
      approximate: false,
    }).match,
    'unanswered'
  );
});

test('indexed templates use current context and retain missing values without changing the whole reply', () => {
  const email = 'What is your email?';
  const rules = [
    {
      ...whole,
      question: `1. ${questions[0]}\n2. ${email}`,
      answers: [{ text: '1. Python.\n2. {{email}}', approved: true }],
    },
  ];
  const options = { rules, approximate: false };
  const missing = planAnswer(email, options);
  assert.equal(missing.complete, false);
  assert.deepEqual(missing.missing, ['email']);
  for (const value of ['previous@example.test', 'current@example.test']) {
    const result = planAnswer(email, { ...options, profile: { email: value } });
    assert.equal(result.text, value);
    assert.equal(result.complete, true);
    assert.equal(result.requiresReview, true);
  }
  assert.equal(rules[0].answers[0].text, '1. Python.\n2. {{email}}');
});

test('backfill joins actual archived component counts and preserves approvals on replay', async () => {
  const store = createMemoryStore();
  await saveAnswerRule(store, whole);
  for (const [index, text] of ['Python.', 'Rust.', 'Python.'].entries()) {
    for (const [offset, sender, body] of [
      [0, 'them', question],
      [1, 'me', `1. ${text}\n2. Hanoi.`],
    ]) {
      const id = index * 2 + offset;
      await store.put({
        id: `msg:hh:index:${id}`,
        source: 'hh',
        chat: 'index',
        sender,
        body,
        timestamp: new Date(1700000000000 + id * 1000).toISOString(),
      });
    }
  }
  const proposal = await learnSavedAnswers(store);
  const city = proposal.rules.find((rule) => rule.question === questions[1]);
  assert.equal(city.answers[0].count, 3);
  assert.equal(city.answers[0].evidence.length, 3);
  const languages = proposal.rules.find(
    (rule) => rule.question === questions[0]
  );
  assert.deepEqual(
    languages.answers.map(({ text, count }) => [text, count]),
    [
      ['Python.', 2],
      ['Rust.', 1],
    ]
  );
  assert.equal((await listAnswerRules(store)).length, 1);
  await learnSavedAnswers(store, { apply: true });
  await saveAnswerRule(store, {
    ...city,
    answers: city.answers.map((answer) => ({ ...answer, approved: true })),
  });
  const saved = await listAnswerRules(store);
  await learnSavedAnswers(store, { apply: true });
  assert.deepEqual(await listAnswerRules(store), saved);
  const answer = await previewAnswer(store, { question: questions[0] });
  assert.equal(answer.text, 'Python.');
  assert.equal(answer.count, 2);
  assert.equal(answer.requiresReview, true);
});

test('backfill retains restricted scope and refuses finite capacity before applying', async () => {
  const store = createMemoryStore();
  await saveAnswerRule(store, { ...whole, sources: ['hh'], chats: ['hh:1'] });
  const result = await learnSavedAnswers(store, { apply: true });
  assert.equal(result.rules.length, 2);
  for (const rule of result.rules) {
    assert.deepEqual(rule.sources, ['hh']);
    assert.deepEqual(rule.chats, ['hh:1']);
    assert.equal(rule.answers[0].count, 0);
  }
  assert.equal(
    (
      await previewAnswer(store, {
        question: questions[1],
        source: 'vk',
        chat: '1',
        approximate: false,
      })
    ).match,
    'unanswered'
  );
  const input = [normalizeAnswerRule(whole)];
  assert.throws(
    () => indexQuestionnaireRules(input, { maxBytes: 32 }),
    /capacity/
  );
  assert.throws(
    () => indexQuestionnaireRules(input, { maxRules: 1 }),
    /capacity/
  );
  assert.equal(input[0].answers[0].approved, true);
});

test('derived variants retain observed frequency order without approval or canonical inheritance', () => {
  const rules = [
    {
      ...whole,
      answers: [
        { text: '1. Rust.\n2. Hanoi.', count: 1, approved: true },
        {
          text: '1. Python.\n2. Hanoi.',
          count: 3,
          approved: true,
          canonical: true,
        },
      ],
    },
  ];
  const answer = planAnswer(questions[0], { rules, approximate: false });
  assert.equal(answer.text, 'Python.');
  assert.equal(answer.count, 3);
  assert.equal(answer.requiresReview, true);
  assert.deepEqual(
    answer.alternatives.map(({ count }) => count),
    [3, 1]
  );
  assert.equal(planAnswer(questions[1], { rules }).count, 4);
});

test('CLI and offline editor backfill saved questionnaires without opening a browser', async () => {
  const store = createMemoryStore();
  await saveAnswerRule(store, whole);
  const cli = createAutomationCommands({ openStore: async () => store });
  const output = [];
  assert.equal(
    await cli.automations(
      {
        _: ['answers', 'backfill-questionnaires'],
        json: true,
      },
      (line) => output.push(line)
    ),
    0
  );
  assert.equal(JSON.parse(output.at(-1)).rules.length, 2);
  assert.equal((await listAnswerRules(store)).length, 1);
  const api = questionApi({
    store,
    remote: { get: async () => null, report: async () => null },
  });
  const result = await api.learnAnswers({ apply: true });
  assert.equal(result.rules.length, 2);
  assert.equal((await listAnswerRules(store)).length, 3);
});

test(
  'explicit questionnaire backfill uses both Lino API encodings and preserves preview purity',
  { timeout: 15000 },
  async () => {
    const store = createMemoryStore();
    await saveAnswerRule(store, whole);
    const server = await startServer({
      port: 0,
      store,
      enableSync: false,
      enableTelegram: false,
      enableHandlers: false,
      automations: { scheduler: false },
    });
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const response = await fetch(
          `http://127.0.0.1:${server.port}/api/automations/answers/backfill-questionnaires`,
          {
            method: 'POST',
            headers: { accept: type, 'content-type': type },
            body: encodeWire({ apply: false }, type),
          }
        );
        assert.equal(response.status, 200);
        const result = await readWireResponse(response);
        assert.equal(result.rules.length, 2);
        assert.equal(result.applied, false);
        assert(
          result.rules.every((rule) =>
            rule.answers.every(
              (answer) => answer.count === 0 && !answer.approved
            )
          )
        );
        assert.equal((await listAnswerRules(store)).length, 1);
      }
    } finally {
      await server.close();
    }
  }
);
