import test from 'node:test';
import assert from 'node:assert/strict';
import { splitQuestions } from '../src/automation/question-match.js';
import { learnAnswerRules } from '../src/automation/question-learning.js';
import { planAnswer } from '../src/automation/question-answers.js';
import {
  questions,
  answers,
  questionnaireMessages,
} from '../../experiments/issue-56/question-lists-fixture.mjs';

const pair = (question, answer) =>
  questionnaireMessages().map((message, index) => ({
    ...message,
    body: index ? answer : question,
  }));
const expected = [
  'Which languages do you use?\nIf Python, describe one project.',
  'Where do you live?',
];
const verify = (rules, question = questions, answer = answers) => {
  assert.equal(rules.length, 3, 'retain whole pair and both aligned parts');
  assert.equal(rules[0].question, question);
  assert.equal(rules[0].answers[0].text, answer);
  assert.equal(rules[1].question, expected[0]);
  assert.equal(rules[1].answers[0].text, 'Python.\nBuilt a search service.');
  assert.equal(rules[2].question, expected[1]);
  assert.equal(rules[2].answers[0].text, 'Hanoi.');
  for (const rule of rules) {
    assert.equal(rule.answers[0].count, 1);
    assert.equal(rule.answers[0].approved, false);
    assert.deepEqual(rule.answers[0].evidence, ['msg:hh:questionnaire:2']);
  }
};

test('separate questions retain conditional subquestions and align multiline numbered answers', () => {
  assert.deepEqual(splitQuestions(questions), expected);
  verify(learnAnswerRules(questionnaireMessages()));
});

test('numbered and bullet questions keep their conditional lines attached to their parent', () => {
  for (const marker of ['numbered', '-', '•', '*']) {
    const question = expected
      .map(
        (text, index) =>
          `${marker === 'numbered' ? `${index + 1}.` : marker} ${text}`
      )
      .join('\n');
    assert.deepEqual(splitQuestions(question), expected);
    verify(learnAnswerRules(pair(question, answers)), question);
  }
  for (const [first, followup, second] of [
    ['Какой у вас опыт?', 'Если да, приведите пример.', 'Где вы живете?'],
    ['您使用什么语言？', '如果使用 Python，请描述一个项目。', '您住在哪里？'],
    [
      'आप कौन सी भाषा जानते हैं?',
      'यदि Python, एक परियोजना बताइए।',
      'आप कहाँ रहते हैं?',
    ],
  ]) {
    const question = `- ${first}\n  ${followup}\n- ${second}`;
    assert.deepEqual(splitQuestions(question), [
      `${first}\n${followup}`,
      second,
    ]);
  }
});

test('balanced code fences and instructions remain in their parent question and answer', () => {
  const question =
    '1. What does this code return?\n```js\n1. not a question?\n2. still code\n```\nUse the given input.\n2. Where do you live?';
  const answer =
    '1. The result is shown below.\n```js\nconst label = "question?";\n```\n2. Hanoi.';
  const parts = splitQuestions(question);
  assert.equal(parts.length, 2);
  assert(parts[0].includes('1. not a question?\n2. still code'));
  assert(parts[0].endsWith('Use the given input.'));
  const learned = learnAnswerRules(pair(question, answer));
  assert.equal(learned.length, 3);
  assert.equal(learned[0].answers[0].text, answer);
  assert.equal(learned[1].question, parts[0]);
  assert.equal(
    learned[1].answers[0].text,
    'The result is shown below.\n```js\nconst label = "question?";\n```'
  );
  assert.equal(learned[2].answers[0].text, 'Hanoi.');
});

test('code indentation and conditional answer wording survive aligned learning', () => {
  const question = '1. What code did you write?\n2. Where do you live?';
  const answer =
    '1. If the value is present, use:\n~~~python\nif value:\n    print("ok?")\n~~~\n2. Hanoi.';
  const learned = learnAnswerRules(pair(question, answer));
  assert.equal(learned.length, 3);
  assert.equal(
    learned[1].answers[0].text,
    'If the value is present, use:\n~~~python\nif value:\n    print("ok?")\n~~~'
  );
  assert.equal(learned[2].answers[0].text, 'Hanoi.');
});

test('ambiguous numbering, mixed markers, unbalanced code and excess parts remain unsplit', () => {
  for (const question of [
    '2. Where do you live?\n1. Which languages do you use?',
    '- Where do you live?\n• Which languages do you use?',
    '1. Where do you live?\n- Which languages do you use?',
    '1. Where do you live?\n1. Which languages do you use?',
    'If yes, where do you live?\nWhich languages do you use?',
    '1. Where do you live?\n```\n2. Which languages do you use?',
    Array.from(
      { length: 21 },
      (_, index) => `${index + 1}. Where do you live?`
    ).join('\n'),
  ]) {
    assert.deepEqual(splitQuestions(question), [question]);
  }
  for (const answer of [
    '2. Hanoi.\n1. Python.',
    '1. Python.\n3. Hanoi.',
    '1. Python.\n1. Hanoi.',
    '1. Python.',
    '- Python.\n- Hanoi.',
    '1. Python.\n```\n2. Hanoi.',
  ]) {
    const learned = learnAnswerRules(pair(questions, answer));
    assert(
      learned.length <= 1,
      'ambiguous answers never invent component associations'
    );
    if (learned.length) {
      assert.equal(learned[0].answers[0].text, answer);
    }
  }
});

test('component assembly requires review while exact whole questionnaire rules keep priority', () => {
  const rules = expected.map((question, index) => ({
    id: `qa-rule:component-${index}`,
    question,
    answers: [
      {
        text: index ? 'Hanoi.' : 'Python.\nBuilt a search service.',
        approved: true,
      },
    ],
  }));
  const assembled = planAnswer(questions, { rules });
  assert.equal(assembled.match, 'assembled');
  assert.equal(assembled.requiresReview, true);
  assert.equal(assembled.complete, true);
  assert.equal(assembled.parts.length, 2);
  const exact = planAnswer(questions, {
    rules: [
      ...rules,
      {
        id: 'qa-rule:whole',
        question: questions,
        answers: [{ text: answers, approved: true }],
      },
    ],
  });
  assert.equal(exact.match, 'exact');
  assert.equal(exact.text, answers);
  assert.equal(exact.requiresReview, false);
});

test('private access URLs in incoming questions remain transcript-only', () => {
  for (const url of [
    'https://t.me/+private-invite',
    'https://example.test/task?access_token=fixture',
    'tg://resolve?domain=private',
  ]) {
    const messages = pair(`Where do you live? ${url}`, 'Hanoi.');
    const before = globalThis.structuredClone(messages);
    assert.deepEqual(learnAnswerRules(messages), []);
    assert.deepEqual(messages, before);
  }
});
