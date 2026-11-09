import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planAnswer,
  normalizeAnswerRule,
} from '../src/automation/question-answers.js';
import { learnAnswerRules } from '../src/automation/question-learning.js';
import { createMemoryStore } from '../src/storage/index.js';
import {
  saveAnswerRule,
  previewAnswer,
} from '../src/automation/question-store.js';
import { questionApi } from '../src/web/question-api.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import {
  readAnswerPolicy,
  saveAnswerPolicy,
} from '../src/automation/question-policy.js';

const question = 'Какой у вас опыт с поиском?';
const wrong = 'Это пример, который владелец отклонил.';
const corrected = 'Разрабатывал гибридный поиск по документам.';
const rule = {
  id: 'qa-rule:search',
  question,
  questions: ['Расскажите об опыте поиска?'],
  answers: [
    { text: wrong, count: 100, approved: true },
    { text: corrected, count: 0, approved: true, canonical: true },
  ],
};
const msg = (id, sender, body) => ({
  id: `msg:hh:1:${id}`,
  source: 'hh',
  chat: '1',
  sender,
  body,
  timestamp: `2026-11-09T10:00:0${id}Z`,
});

test('explicit canonical answers and question aliases override old frequencies', () => {
  for (const text of [question, rule.questions[0]]) {
    const result = planAnswer(text, { rules: [rule] });
    assert.equal(result.text, corrected);
    assert.equal(result.requiresReview, false);
    assert.equal(result.count, 0, 'approval invents no observations');
  }
  const historical = {
    ...rule,
    id: 'qa-rule:old',
    answers: [{ text: wrong, approved: true }],
  };
  const replacement = {
    ...rule,
    answers: [{ text: corrected, approved: true, canonical: true }],
  };
  assert.equal(
    planAnswer(question, { rules: [historical, replacement] }).requiresReview,
    false
  );
});

test('rejected content stays excluded inside quoted Markdown and paraphrased questions', () => {
  const result = planAnswer(question, {
    rules: [
      { ...rule, answers: [{ text: `*${wrong}*`, count: 50, approved: true }] },
    ],
    policy: { rejected: [wrong] },
  });
  assert.equal(result.text, '');
  const learned = learnAnswerRules(
    [msg(1, 'them', question), msg(2, 'me', `Acknowledgement.\n*${wrong}*`)],
    { policy: { rejected: [wrong] } }
  );
  assert.deepEqual(learned, []);
  assert.equal(
    planAnswer(question, {
      rules: [{ ...rule, answers: [{ text: 'Node.js', approved: true }] }],
      policy: { rejected: ['No'] },
    }).text,
    'Node.js'
  );
});

test('completed bot summaries teach unapproved facts with zero observed sends and need no reply', () => {
  const summary = `Ваши ответы:\n${question}: ${corrected}\nГде вы живете?: Вьетнам`;
  const learned = learnAnswerRules([msg(1, 'bot', summary)]);
  assert.equal(learned.length, 2);
  assert.equal(learned[0].answers[0].count, 0);
  assert.equal(learned[0].answers[0].approved, false);
  assert.deepEqual(learned[0].answers[0].evidence, ['msg:hh:1:1']);
  assert.equal(planAnswer(summary, { rules: [rule] }).noReply, true);
  assert.notEqual(
    planAnswer(`${summary}\nКогда сможете начать?`, { rules: [rule] }).noReply,
    true
  );
  assert.notEqual(
    planAnswer(`${summary}\nПришлите ссылку на резюме.`, { rules: [rule] })
      .noReply,
    true
  );
  assert.equal(
    planAnswer(summary.replace('Ваши ответы:', '**Ваши ответы**')).noReply,
    true
  );
});

test('rejections apply after profile substitution and conflicting corrections need review', () => {
  assert.equal(
    planAnswer(question, {
      rules: [{ ...rule, answers: [{ text: '{{answer}}', approved: true }] }],
      profile: { answer: wrong },
      policy: { rejected: [wrong] },
    }).text,
    ''
  );
  const result = planAnswer(question, {
    rules: [
      {
        ...rule,
        answers: [
          { text: corrected, canonical: true, approved: true, count: 10 },
          { text: 'Другая правка владельца.', canonical: true, approved: true },
        ],
      },
    ],
  });
  assert.equal(result.requiresReview, true);
  assert.throws(
    () =>
      normalizeAnswerRule({
        ...rule,
        answers: [
          { text: 'One', count: Number.MAX_SAFE_INTEGER },
          { text: 'Two', count: 1 },
        ],
      }),
    /frequency/u
  );
});

test('punctuation equivalence combines only explicitly configured variants', () => {
  const options = {
    rules: [
      {
        ...rule,
        answers: [
          { text: 'Пять лет', count: 2, approved: true },
          { text: 'Пять лет.', count: 3, approved: true },
        ],
      },
    ],
  };
  assert.equal(planAnswer(question, options).count, 3);
  const combined = planAnswer(question, {
    ...options,
    policy: { punctuationEquivalent: true },
  });
  assert.equal(combined.count, 5);
  assert.equal(combined.text, 'Пять лет.');
  options.rules[0].answers.push({
    text: 'Пять лет!',
    count: 4,
    approved: true,
  });
  const three = planAnswer(question, {
    ...options,
    policy: { punctuationEquivalent: true },
  });
  assert.equal(three.count, 9);
  assert.equal(three.text, 'Пять лет!');
});

test('CLI, offline UI and fresh readers share persisted policy without false saves', async () => {
  const store = createMemoryStore();
  await saveAnswerRule(store, rule);
  const cli = createAutomationCommands({ openStore: async () => store });
  const output = [];
  await cli.automations(
    { _: ['answers', 'policy'], reject: corrected, json: true },
    (line) => output.push(line)
  );
  assert.deepEqual(JSON.parse(output.at(-1)).policy.rejected, [corrected]);
  assert.equal((await previewAnswer(store, { question })).text, '');
  await assert.rejects(saveAnswerRule(store, rule), /rejected/u);
  await cli.automations(
    { _: ['answers', 'policy'], 'clear-rejected': 'false', json: true },
    () => {}
  );
  assert.deepEqual((await readAnswerPolicy(store)).rejected, [corrected]);
  const remote = { get: async () => null, report: async () => null };
  const api = questionApi({ remote, store });
  assert.deepEqual((await api.answerPolicy()).rejected, [corrected]);
  await api.saveAnswerPolicy({
    rejected: [wrong],
    punctuationEquivalent: true,
  });
  assert.equal((await previewAnswer(store, { question })).text, corrected);
  remote.report = async () => ({
    error: 'Policy save refused',
    status: 'failed',
  });
  await assert.rejects(api.saveAnswerPolicy({ rejected: [] }), /refused/u);
  assert.deepEqual((await readAnswerPolicy(store)).rejected, [wrong]);
  await assert.rejects(
    saveAnswerPolicy(store, { rejected: [null] }),
    /rejected/u
  );
  await assert.rejects(
    saveAnswerPolicy(store, { punctuationEquivalent: 'true' }),
    /boolean/u
  );
  assert.equal(
    (await questionApi({ remote, store }).answerPolicy()).punctuationEquivalent,
    true
  );
});
