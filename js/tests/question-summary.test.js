import test from 'node:test';
import assert from 'node:assert/strict';
import {
  summaryAnswerPairs,
  completedAnswerSummary,
} from '../src/automation/question-summary.js';
import { learnAnswerRules } from '../src/automation/question-learning.js';
import { planAnswer } from '../src/automation/question-answers.js';
import {
  summary,
  summaryMessage,
} from '../../experiments/issue-56/question-summary-fixture.mjs';

const expected = [
  { question: 'Есть ли у вас опыт использования Rust?', text: 'Нет.' },
  {
    question: 'Расскажите о вашем опыте с поиском',
    text: 'Разрабатывал поиск по техническим документам.',
  },
];

test('assistant handovers with answer labels on preceding lines teach facts with zero sends', () => {
  assert.deepEqual(summaryAnswerPairs(summary), expected);
  assert.equal(completedAnswerSummary(summary), true);
  assert.equal(planAnswer(summary).noReply, true);
  const messages = [summaryMessage()];
  const before = globalThis.structuredClone(messages);
  const rules = learnAnswerRules(messages);
  assert.equal(rules.length, 2);
  for (const rule of rules) {
    assert.equal(rule.answers[0].count, 0);
    assert.equal(rule.answers[0].approved, false);
    assert.deepEqual(rule.answers[0].evidence, [messages[0].id]);
  }
  assert.deepEqual(messages, before);
});

test('four-language explicit summaries accept question/answer labels and empty-employer-question footers', () => {
  for (const [header, questionLabel, answerLabel, footer, none] of [
    [
      'Your answers:',
      'Question',
      'Answer',
      'Questions for the employer:',
      'None',
    ],
    [
      'Ваши ответы:',
      'Вопрос',
      'Ответ',
      'Вопросы к работодателю:',
      'Вопросов не было',
    ],
    [
      'आपके उत्तर:',
      'प्रश्न',
      'उत्तर',
      'नियोक्ता के लिए प्रश्न:',
      'कोई प्रश्न नहीं',
    ],
    ['您的回答：', '问题', '回答', '向雇主提出的问题：', '没有问题'],
  ]) {
    const text = `${header}\n${questionLabel}: Where do you live?\n${answerLabel}: Hanoi.\n${footer}\n${none}`;
    assert.deepEqual(summaryAnswerPairs(text), [
      { question: 'Where do you live?', text: 'Hanoi.' },
    ]);
    assert.equal(completedAnswerSummary(text), true);
  }
});

test('headerless handovers require multiple complete pairs and a recognizable question', () => {
  const text =
    'Which languages do you use?: Rust.\nОпыт работы с поиском: Пять лет.';
  assert.deepEqual(summaryAnswerPairs(text), [
    { question: 'Which languages do you use?', text: 'Rust.' },
    { question: 'Опыт работы с поиском', text: 'Пять лет.' },
  ]);
  assert.equal(completedAnswerSummary(text), true);
  for (const ambiguous of [
    'Адрес: Москва\nГрафик: 5/2',
    'Which languages do you use?: Rust.',
    'Where do you live? Tell us more.',
  ]) {
    assert.deepEqual(summaryAnswerPairs(ambiguous), []);
    assert.equal(completedAnswerSummary(ambiguous), false);
  }
});

test('quoted counterquestions are not learned and an appended new task remains actionable', () => {
  const text =
    'Your answers:\nWhere do you live?: Could I work remotely?\nWhich languages do you use?: Rust.';
  assert.deepEqual(summaryAnswerPairs(text), [
    { question: 'Which languages do you use?', text: 'Rust.' },
  ]);
  assert.equal(completedAnswerSummary(text), true);
  for (const appended of [
    '\nWhen can you start?',
    '\nPlease send your CV.',
    '\nQuestions for the employer:\nWhen is the interview?',
    '\nQuestions for the employer: When is the interview?',
    '\nhttps://example.test/new-assignment',
    '\nNew task: Send your CV.',
  ]) {
    assert.equal(completedAnswerSummary(summary + appended), false);
    assert.notEqual(planAnswer(summary + appended).noReply, true);
  }
});

test('explicit multiline answers retain fenced code, while unfinished fences and excess pairs need review', () => {
  const text =
    'Conversation summary:\nQuestion: What code did you write?\nAnswer:\n```python\nif value:\n    print("ok?")\n```\nQuestion: Where do you live?\nAnswer: Hanoi.';
  assert.deepEqual(summaryAnswerPairs(text), [
    {
      question: 'What code did you write?',
      text: '```python\nif value:\n    print("ok?")\n```',
    },
    { question: 'Where do you live?', text: 'Hanoi.' },
  ]);
  assert.equal(completedAnswerSummary(text), true);
  assert.equal(
    completedAnswerSummary(text.replace('```\nQuestion', '\nQuestion')),
    false
  );
  const excess = `Your answers:\n${Array.from({ length: 21 }, (_, i) => `Where did you work ${i}?: Example ${i}.`).join('\n')}`;
  assert.equal(summaryAnswerPairs(excess).length, 20);
  assert.equal(completedAnswerSummary(excess), false);
  assert.deepEqual(summaryAnswerPairs('x'.repeat(12001)), []);
});

test('unfinished fences cannot expose quoted pairs and balanced code keeps blank lines', () => {
  const unfinished =
    'Your answers:\nQuestion: What did you write?\nAnswer:\n```\nWhere do you live?: Fake place.';
  assert.deepEqual(summaryAnswerPairs(unfinished), []);
  assert.equal(completedAnswerSummary(unfinished), false);
  const complete =
    'Your answers:\n**Question:** What did you write?\n\n**Answer:**\n```python\nif value:\n\n    print("ok?")\n```';
  assert.deepEqual(summaryAnswerPairs(complete), [
    {
      question: 'What did you write?',
      text: '```python\nif value:\n\n    print("ok?")\n```',
    },
  ]);
  assert.equal(completedAnswerSummary(complete), true);
  assert.deepEqual(
    summaryAnswerPairs(
      'Your answers:\nQuestion: What is your preference: remote or office?\nAnswer: Remote.'
    ),
    [
      {
        question: 'What is your preference: remote or office?',
        text: 'Remote.',
      },
    ]
  );
});

test('private and rejected facts stay excluded when quoted by a completed summary', () => {
  const message = {
    ...summaryMessage(),
    body: 'В разговоре с кандидатом я узнал:\n- Where do you live? Ответ:\n- *Rejected wording.*\n- Please share your CV? Ответ:\n- https://example.test/private?access_token=fixture\nВопросов к работодателю не было',
  };
  assert.deepEqual(
    learnAnswerRules([message], {
      policy: { rejected: ['Rejected wording.'] },
    }),
    []
  );
  assert.equal(planAnswer(message.body).noReply, true);
});
