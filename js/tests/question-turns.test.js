import test from 'node:test';
import assert from 'node:assert/strict';
import { learnAnswerRules } from '../src/automation/question-learning.js';
import { planAnswer } from '../src/automation/question-answers.js';

const technical = 'Расскажите о вашем опыте с Kubernetes.';
const reminder = 'Мы можем продолжить наше общение?';
const detail = 'Да, сопровождал кластер из 12 узлов.';
const message = (id, sender, body, extra = {}) => ({
  id: `msg:hh:turns:${id}`,
  source: 'hh',
  chat: 'turns',
  sender,
  body,
  timestamp: new Date(Date.UTC(2026, 10, 9, 10, 0, id)).toISOString(),
  ...extra,
});
const rule = (question, text) => ({
  id: 'qa-rule:turns',
  question,
  answers: [{ text, approved: true, count: 2 }],
});
const pairs = (messages) =>
  learnAnswerRules(messages).map((entry) => [
    entry.question,
    entry.answers[0].text,
  ]);

test('learning removes only bounded acknowledgment and polite question openers', () => {
  for (const [incoming, core] of [
    ['Понял, спасибо за подробности. А где вы живете?', 'Где вы живете?'],
    ['Ок, а где вы живете?', 'Где вы живете?'],
    [
      'Расскажите, пожалуйста, был ли у вас опыт с Rust?',
      'Был ли у вас опыт с Rust?',
    ],
    ['Thanks for the details! Where do you live?', 'Where do you live?'],
    ['धन्यवाद। आप कहाँ रहते हैं', 'आप कहाँ रहते हैं'],
    ['谢谢。您住在哪里', '您住在哪里'],
  ]) {
    const messages = [
      message(1, 'them', incoming),
      message(2, 'me', 'Vietnam'),
    ];
    const before = JSON.stringify(messages);
    assert.deepEqual(pairs(messages), [[core, 'Vietnam']], incoming);
    assert.equal(
      JSON.stringify(messages),
      before,
      'source transcript remains intact'
    );
  }
});

test('approved question cores match new acknowledgments without weakening other requests', () => {
  const question = 'Where do you live?';
  const options = { rules: [rule(question, 'Vietnam')] };
  const incoming = 'Thanks for the details! Where do you live?';
  const result = planAnswer(incoming, options);
  assert.equal(result.text, 'Vietnam');
  assert.equal(result.match, 'exact');
  assert.equal(result.requiresReview, false);
  assert.equal(result.question, incoming);
  for (const extra of [
    'Please send a passport scan. ',
    'What is your phone number? ',
    'Thanks! Please complete https://forms.example/test. ',
    'Хорошо понимаете английский? ',
  ]) {
    assert.notEqual(
      planAnswer(extra + question, options).requiresReview,
      false,
      extra
    );
  }
});

test('actual substantive answers after a reminder belong to the original technical question', () => {
  assert.deepEqual(
    pairs([
      message(1, 'them', technical),
      message(2, 'them', reminder),
      message(3, 'me', detail),
    ]),
    [[technical, detail]]
  );
});

test('brief consent answers the reminder and never teaches technical experience', () => {
  for (const consent of [
    'Да',
    'Да, давайте продолжим.',
    "Yes, let's continue.",
    'Нет, спасибо.',
  ]) {
    assert.deepEqual(
      pairs([
        message(1, 'them', technical),
        message(2, 'them', reminder),
        message(3, 'me', consent),
      ]),
      [[reminder, consent]]
    );
  }
});

test('explicit reply links outrank reminder adjacency', () => {
  for (const [parent, expected] of [
    [1, technical],
    [2, reminder],
  ]) {
    assert.deepEqual(
      pairs([
        message(1, 'them', technical),
        message(2, 'them', reminder),
        message(3, 'me', detail, { replyTo: `msg:hh:turns:${parent}` }),
      ]),
      [[expected, detail]]
    );
  }
});

test('standalone greetings contribute no answer or evidence', () => {
  const messages = [
    message(1, 'them', technical),
    message(2, 'me', 'Здравствуйте!'),
    message(3, 'me', detail),
  ];
  const learned = learnAnswerRules(messages);
  assert.equal(learned[0].answers[0].text, detail);
  assert.deepEqual(learned[0].answers[0].evidence, ['msg:hh:turns:3']);
  assert.deepEqual(pairs(messages.slice(0, 2)), []);
});

test('salary matching uses the question core while preserving the original question', () => {
  const question =
    'Thanks for the details! What salary in USD net do you expect?';
  const result = planAnswer(question, {
    salary: {
      enabled: true,
      approved: true,
      exchangeMode: 'snapshot',
      defaultCurrency: 'USD',
      defaultBasis: 'net',
      currencies: [
        { code: 'USD', keywords: ['USD', '$'], net: 6000, hourlyStep: 5 },
      ],
    },
  });
  assert.equal(result.question, question);
  assert.equal(result.text, 'From $6 000 net per month.');
  assert.equal(result.requiresReview, false);
});

test('repeated reminders cannot extend the original question lifetime', () => {
  const messages = [
    message(1, 'them', technical, { timestamp: '2026-11-08T10:00:00Z' }),
    message(2, 'them', reminder, { timestamp: '2026-11-09T09:00:00Z' }),
    message(3, 'them', 'Can we continue our conversation?', {
      timestamp: '2026-11-09T11:00:00Z',
    }),
    message(4, 'me', detail, { timestamp: '2026-11-09T11:01:00Z' }),
  ];
  assert.deepEqual(pairs(messages), [
    ['Can we continue our conversation?', detail],
  ]);
  messages[3].replyTo = 'msg:hh:turns:unrelated';
  assert.deepEqual(pairs(messages), []);
});

test('another question, a service barrier and stale history prevent reminder reassociation', () => {
  assert.deepEqual(
    pairs([
      message(1, 'them', technical),
      message(2, 'them', 'Where do you live?'),
      message(3, 'them', reminder),
      message(4, 'me', 'Vietnam'),
    ]),
    [['Where do you live?', 'Vietnam']]
  );
  for (const barrier of [
    message(2, 'system', '', { service: true }),
    message(2, 'them', 'An unrelated notice.'),
  ]) {
    assert.deepEqual(
      pairs([
        message(1, 'them', technical),
        barrier,
        message(3, 'them', reminder),
        message(4, 'me', detail),
      ]),
      [[reminder, detail]]
    );
  }
  assert.deepEqual(
    pairs([
      message(1, 'them', technical, { timestamp: '2026-11-07T10:00:00Z' }),
      message(2, 'them', reminder),
      message(3, 'me', detail),
    ]),
    [[reminder, detail]]
  );
});

test('a bare affirmative never authorizes an answer requiring details or examples', () => {
  for (const question of [
    technical,
    'Describe your database migration experience.',
    'Please provide examples of your work.',
    'Приведите примеры ваших проектов.',
    'कृपया अपना अनुभव बताएं',
    '请介绍您的经验',
  ]) {
    for (const text of ['Да', 'Yes.', 'हाँ', '是']) {
      const planned = planAnswer(question, { rules: [rule(question, text)] });
      assert.equal(planned.requiresReview, true, question);
      assert.equal(planned.complete, false, question);
      assert.deepEqual(
        pairs([message(1, 'them', question), message(2, 'me', text)]),
        []
      );
    }
  }
  for (const [question, text] of [
    ['Have you used Rust?', 'Yes.'],
    ['Работали ли вы с Rust?', 'Да'],
    [technical, 'Нет, с Kubernetes не работал.'],
  ]) {
    assert.equal(
      planAnswer(question, { rules: [rule(question, text)] }).requiresReview,
      false
    );
  }
});
