import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  learnConversation,
  questionAnswers,
  sameQuestion,
} from '../src/crm/person-learn.js';
import { conversationSuggestions } from '../src/crm/conversation-context.js';
import { acquaintanceConversation } from './helpers/conversation-fixture.js';

test('the acquaintance thread retains programmer evidence, friendship, informal address and the shared profile', () => {
  const messages = acquaintanceConversation();
  const learned = learnConversation(messages);
  const work = learned.work.find((fact) => fact.profession === 'programmer');
  assert.equal(work.value, 'программист');
  assert(work.evidence.includes(messages[1].id));
  assert(work.evidence.includes(messages[3].id));
  assert.equal(learned.relationships[0].status, 'agreed');
  assert.deepEqual(learned.relationships[0].evidence, [
    messages[5].id,
    messages[6].id,
  ]);
  assert.equal(learned.address.form, 'informal');
  assert.equal(learned.accounts[0].url, 'https://github.com/example-developer');
  assert.deepEqual(learned.summary.topics, ['work', 'friendship', 'accounts']);
});

test('replying to an old affirmative answer continues its programmer-to-GitHub thread across providers', () => {
  for (const source of ['telegram', 'vk', 'matrix']) {
    const messages = acquaintanceConversation(source);
    const before = conversationSuggestions(messages.slice(0, 7), {
      replyTo: '4',
    });
    assert.equal(before.context.question.id, messages[1].id);
    assert.equal(before.context.intent, 'work');
    assert.equal(before.suggestions[0].rule, 'work.github');
    assert.equal(before.suggestions[0].text, 'А ты есть на GitHub?');
    const availability = conversationSuggestions(messages.slice(0, 9), {
      replyTo: '9',
    });
    assert.equal(availability.suggestions[0].rule, 'github.link');
    const after = conversationSuggestions(messages, { replyTo: '4' });
    assert(after.suggestions.every((item) => item.rule !== 'work.github'));
    assert.equal(after.suggestions[0].rule, 'work.projects');
  }
});

test('no confirmation is invented from uncertainty, a different question, a third party or a forwarded answer', () => {
  const original = acquaintanceConversation().slice(0, 4);
  for (const body of ['Нет', 'Возможно', 'Да, мой друг программист']) {
    const messages = [original[1], { ...original[3], body }];
    const learned = learnConversation(messages);
    assert(
      !learned.work.some(
        (fact) => fact.profession === 'programmer' && !fact.negated
      ),
      body
    );
    assert(
      !conversationSuggestions(messages).suggestions.some(
        (item) => item.rule === 'work.github'
      ),
      body
    );
  }
  const forwarded = [
    original[1],
    { ...original[3], body: 'Да', forwardedFrom: { name: 'Other person' } },
  ];
  assert(
    !learnConversation(forwarded).work.some(
      (fact) => fact.profession === 'programmer'
    )
  );
  const ambiguous = [
    original[1],
    { ...original[2], sender: 'me', body: 'Ты живешь в Москве?' },
    { ...original[3], body: 'Да' },
  ];
  assert.equal(questionAnswers(ambiguous)[0].answer, null);
});

test('explicit answers keep their original question across delays and unrelated threads', () => {
  const messages = acquaintanceConversation();
  const reply = { ...messages[8], body: 'Да', replyTo: '111:2' };
  const qa = questionAnswers([messages[1], messages[7], reply]);
  assert.equal(qa[0].answer.basis, 'reply');
  assert.equal(qa[0].answer.id, reply.id);
  assert.equal(qa[1].answer, null);
});

test('rules stay on by default and can be disabled independently without losing source messages', () => {
  const messages = acquaintanceConversation();
  assert.equal(learnConversation(messages, { facts: false }).work.length, 0);
  assert.equal(
    learnConversation(messages, { facts: false }).relationships.length,
    0
  );
  assert(learnConversation(messages, { facts: false }).questions.length > 0);
  assert.equal(
    learnConversation(messages, { questions: false }).questions.length,
    0
  );
  assert.deepEqual(
    conversationSuggestions(messages, {
      replyTo: '4',
      settings: { enabled: false },
    }).suggestions,
    []
  );
  assert.deepEqual(
    conversationSuggestions(messages, {
      replyTo: '4',
      settings: { suggestions: false },
    }).suggestions,
    []
  );
  assert.equal(messages.length, 19);
});

test('new conversations get a greeting, answered conversations do not get another automatic reply', () => {
  assert.equal(
    conversationSuggestions([], { locale: 'ru' }).suggestions[0].text,
    'Привет!'
  );
  const messages = acquaintanceConversation().slice(0, 8);
  assert.equal(conversationSuggestions(messages).suggestions.length, 0);
});

test('profile requests and profession questions keep different predicates separate', () => {
  assert.equal(sameQuestion('Ты программист?', 'Ты дизайнер?'), false);
  assert.equal(sameQuestion('Ты программист?', 'Где ты работаешь?'), false);
  assert.equal(sameQuestion('Есть GitHub?', 'Есть LinkedIn?'), false);
});

test('friendship requires an actual reciprocal agreement', () => {
  const messages = acquaintanceConversation().slice(5, 7);
  for (const body of ['Нет', 'Может потом', 'Мой друг так говорит']) {
    assert.deepEqual(
      learnConversation([messages[0], { ...messages[1], body }]).relationships,
      []
    );
  }
});
