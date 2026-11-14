import test from 'node:test';
import assert from 'node:assert/strict';
import {
  asksQuestion,
  matchQuestion,
  questionKey,
  questionWords,
  splitQuestions,
} from '../src/automation/question-match.js';
import { isQuestion } from '../src/crm/conversation-questions.js';
import { planAnswer } from '../src/automation/question-answers.js';
import { learnAnswerRules } from '../src/automation/question-learning.js';
import { planAutomation } from '../src/automation/automations.js';

const languages = [
  ['Where do you live', 'Vietnam', 'Please share your experience'],
  ['Где вы живете', 'Вьетнам', 'Поделись своим опытом'],
  ['आप कहाँ रहते हैं', 'वियतनाम', 'कृपया अपना अनुभव बताएं'],
  ['您住在哪里', '越南', '请介绍您的经验'],
];
const rule = (question, text, id = 'location') => ({
  id: `qa-rule:${id}`,
  question,
  answers: [{ text, count: 2, approved: true }],
});
const message = (id, sender, body, source = 'hh') => ({
  id: `msg:${source}:1:${id}`,
  source,
  chat: '1',
  sender,
  body,
  timestamp: `2026-11-09T10:00:0${id}Z`,
});

test('different Hindi vowel marks cannot reuse an approved exact answer', () => {
  const left = 'इस दिन का अर्थ क्या है?';
  const right = 'इस दीन का अर्थ क्या है?';
  assert.notEqual(questionKey(left), questionKey(right));
  assert.equal(matchQuestion(left, right), null);
  assert.equal(
    planAnswer(right, { rules: [rule(left, 'day')] }).requiresReview,
    true
  );
  assert.equal(
    planAnswer(left, {
      rules: [rule(left, 'दिन')],
      options: ['दीन'],
    }).optionMismatch,
    true
  );
});

test('word and template matching retain combining marks and internal joiners', () => {
  assert.deepEqual(questionWords('क्षेत्र क्‍षेत्र'), ['क्षेत्र', 'क्‍षेत्र']);
  assert.equal(matchQuestion('Quel café?', 'Quel cafe\u0301?'), 'exact');
  assert.equal(
    matchQuestion('कितने दिन … हैं?', 'कितने दिन बाकी हैं?'),
    'template'
  );
  assert.equal(matchQuestion('कितने दिन … हैं?', 'कितने दीन बाकी हैं?'), null);
  for (const [left, right] of [
    ['C++', 'C'],
    ['C#', 'C'],
    ['.NET', 'NET'],
    ['$5000', '€5000'],
    ['name@example.test', 'other@example.test'],
    ['दीन', 'दिन'],
  ]) {
    assert.notEqual(questionKey(left), questionKey(right));
  }
});

test('CRM and automation recognize bounded questions and requests in four languages', () => {
  const questions = [
    ...languages.flatMap(([question, , request]) => [question, request]),
    'Спасибо за отклик! Подскажи свои зарплатные ожидания',
    'Понял, спасибо за подробности. А есть ли у вас опыт работы с NestJS',
    'Приведи пример',
    'Thanks! Where do you live',
    'Ок, а где вы находитесь',
    'Please provide your profile.',
    'आपका नाम क्या है',
    'आपके पास कितना अनुभव है',
    'क्या आप तैयार हैं।',
    'धन्यवाद। कृपया अपना अनुभव बताएं',
    'कृपया अपना प्रोफ़ाइल साझा करें।',
    '谢谢。请介绍您的经验',
    '请问，您有多少经验',
    '你能参加面试吗',
    '为什么选择这家公司',
  ];
  for (const text of questions) {
    assert.equal(asksQuestion(text), true, text);
    assert.equal(isQuestion(text), true, text);
  }
  for (const text of ['', ' ', '?'.repeat(6001)]) {
    assert.equal(asksQuestion(text), false);
    assert.equal(isQuestion(text), false);
  }
});

test('template gaps cannot absorb an unmarked question in any supported language', () => {
  for (const text of [
    'Experience where do you live details',
    'Experience где вы живете details',
    'Experience आप कहाँ रहते हैं details',
    'Experience 您住在哪里 details',
    'Experience कृपया अपना अनुभव बताएं details',
    'Experience 请介绍您的经验 details',
  ]) {
    assert.equal(matchQuestion('Experience … details', text), null, text);
  }
  assert.equal(
    matchQuestion('Experience … details', 'Experience five years details'),
    'template'
  );
});

test('announcements, thanks and lookalike words do not become questions', () => {
  for (const text of [
    'We will contact you later.',
    'I will send my profile later.',
    'Please wait.',
    'Thanksgiving is next week',
    'What a great day!',
    'Мы укажем условия позже.',
    'Я напишу зарплатные ожидания позже.',
    'Спасибо, сообщим позже.',
    'Что ж, ладно.',
    'Укажитеcя в списке',
    'हम बाद में संपर्क करेंगे।',
    'आपका नाम सूची में है।',
    'मुझे पता है कि आप कहाँ रहते हैं।',
    'कृपया प्रतीक्षा करें।',
    'धन्यवाद।',
    '我们稍后联系您。',
    '我知道你住在哪里。',
    '请稍等。',
    '谢谢。',
  ]) {
    assert.equal(asksQuestion(text), false, text);
    assert.equal(isQuestion(text), false, text);
  }
});

test('each provider plans the same punctuation-free approved questions', () => {
  for (const source of ['hh', 'telegram', 'vk', 'email', 'whatsapp']) {
    for (const [question, text] of languages) {
      const plan = planAutomation(
        [message(1, 'them', question, source), rule(question, text)],
        {
          id: 'answer',
          action: { kind: 'answer-questions' },
          conditions: { mutual: false, cooldownDays: 0 },
        },
        { self: ['me'], targets: [{ source, chat: '1' }] }
      );
      assert.equal(plan.drafts.length, 1, `${source}: ${question}`);
      assert.equal(plan.drafts[0].text, text);
      assert.equal(plan.drafts[0].answer.requiresReview, false);
    }
  }
});

test('multilingual outgoing questions form learning barriers', () => {
  for (const [question, text, request] of languages) {
    const learned = learnAnswerRules([
      message(1, 'them', question),
      message(2, 'me', text),
    ]);
    assert.equal(learned.length, 1, question);
    assert.equal(learned[0].answers[0].text, text);
    assert.equal(learned[0].answers[0].approved, false);
    assert.deepEqual(
      learnAnswerRules([
        message(1, 'them', question),
        message(2, 'me', request),
        message(3, 'me', text),
      ]),
      [],
      request
    );
  }
});

test('numbered multilingual requests assemble aligned reviewable answers', () => {
  for (const [question, text, request] of languages) {
    const input = `1. ${question}\n2. ${request}`;
    assert.deepEqual(splitQuestions(input), [question, request]);
    const planned = planAnswer(input, {
      rules: [rule(question, text), rule(request, 'Five years.', 'experience')],
    });
    assert.equal(planned.text, `1. ${text}\n2. Five years.`);
    assert.equal(planned.complete, true);
    assert.equal(planned.requiresReview, true);
  }
});
