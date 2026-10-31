// What a conversation tells about the other person (R-Y50 .. R-Y54):
// questions and answers, "ты" or "вы", work, accounts elsewhere, and
// questions of the same meaning grouped. Made-up conversations only.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createQuestionMatcher,
  addressFormOf,
  groupQuestions,
  intentOf,
  isQuestion,
  learnAccounts,
  learnAddress,
  learnConversation,
  learnWork,
  questionAnswers,
  sameQuestion,
} from '../src/crm/person-learn.js';

let hour = 0;
const say = (sender, body, { gapHours = 1 } = {}) => {
  hour += gapHours;
  return {
    id: `msg:test:1:${hour}`,
    sender,
    body,
    timestamp: new Date(Date.UTC(2026, 0, 1) + hour * 3_600_000).toISOString(),
  };
};

test('questions are found by their mark or their first word', () => {
  assert.equal(isQuestion('Как дела'), true);
  assert.equal(isQuestion('Where are you now?'), true);
  assert.equal(isQuestion('Что ж, ладно.'), false);
  assert.equal(isQuestion('Ну как'), false);
  assert.equal(isQuestion(''), false);
});

test('a question is answered by what the other side says next, within a day', () => {
  hour = 0;
  const messages = [
    say('me', 'Где ты сейчас работаешь?'),
    say('7', 'В одной студии'),
    say('7', 'дизайнером'),
    say('me', 'Здорово'),
    say('me', 'Когда созвонимся?'),
    say('7', 'Завтра', { gapHours: 30 }),
  ];
  const pairs = questionAnswers(messages);
  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].intent, 'work');
  assert.equal(pairs[0].question.by, 'me');
  assert.equal(pairs[0].answer.text, 'В одной студии\nдизайнером');
  assert.equal(pairs[1].intent, 'meeting');
  assert.equal(pairs[1].answer, null);
});

test('"на ты?" — "давай" settles the informal form over what was used', () => {
  hour = 0;
  const messages = [
    say('me', 'Здравствуйте! Вы сможете прислать ваше резюме?'),
    say('7', 'Да, пришлю вам сегодня'),
    say('me', 'Можно на ты?'),
    say('7', 'Давай!'),
  ];
  const address = learnAddress(messages);
  assert.equal(address.form, 'informal');
  assert.equal(address.basis, 'agreed');
  assert.deepEqual(address.evidence, [messages[2].id, messages[3].id]);
  assert.equal(addressFormOf(messages).reason, 'agreed');
});

test('a refusal settles the other form; no agreement falls back to use', () => {
  hour = 0;
  const refused = [say('me', 'Может, на ты?'), say('7', 'Лучше на вы')];
  assert.equal(learnAddress(refused).form, 'formal');
  hour = 0;
  const used = [
    say('me', 'Ты где?'),
    say('7', 'Дома, а ты?'),
    say('me', 'Тоже'),
  ];
  assert.equal(learnAddress(used).basis, 'used');
  assert.equal(learnAddress(used).form, 'informal');
  assert.equal(learnAddress([]).basis, 'none');
});

test('work is read from what they say about themselves and from answers', () => {
  hour = 0;
  const messages = [
    say('7', 'Я работаю в Example Labs уже год'),
    say('me', 'Я работаю в другой компании'),
    say('7', 'I am a data engineer at Example Corp'),
    say('me', 'Чем ты сейчас занимаешься?'),
    say('7', 'Делаю мобильные игры'),
  ];
  const work = learnWork(messages);
  const values = work.map((w) => `${w.kind}:${w.value}:${w.basis}`);
  assert.deepEqual(values, [
    'answer:Делаю мобильные игры:answered',
    'position:data engineer:said',
    'workplace:Example Corp:said',
    'workplace:Example Labs уже год:said',
  ]);
  assert.equal(
    work.some((w) => w.value.includes('другой')),
    false,
    'our own words are not about them'
  );
});

test('accounts come from links they sent, one per account', () => {
  hour = 0;
  const messages = [
    say('7', 'Мой профиль: https://www.linkedin.com/in/jane-doe-123/'),
    say('7', 'github.com/janedoe, и ещё github.com/janedoe/repo'),
    say('7', 'Пиши на jane@example.org.'),
    say('me', 'А мой — github.com/someone-else'),
    say('7', 'Ещё раз: https://github.com/janedoe'),
    say('7', 'https://github.com/features и t.me/joinchat'),
  ];
  const accounts = learnAccounts(messages).map(
    (a) => `${a.network}:${a.handle}`
  );
  assert.deepEqual(accounts.toSorted(), [
    'email:jane@example.org',
    'github:janedoe',
    'linkedin:jane-doe-123',
  ]);
});

test('questions with the same meaning in other words are one (R-Y54)', () => {
  const same = [
    ['На вы?', 'Можно к вам на вы обращаться?'],
    ['Можно на ты?', 'Давай на ты?'],
    ['Where do you work?', 'What company are you at?'],
    ['Кем ты работаешь?', 'Чем занимаешься по работе?'],
    ['Do you have a LinkedIn?', 'Can you send me your LinkedIn profile?'],
    ['Когда созвонимся?', 'В какое время удобно поговорить?'],
    ['Как прошёл переезд?', 'Как переезд прошёл?'],
  ];
  const different = [
    ['На вы?', 'На ты?'],
    ['Where do you work?', 'Where do you live?'],
    ['Когда созвонимся?', 'Зачем созваниваться?'],
    ['Как прошёл переезд?', 'Как здоровье?'],
  ];
  for (const [a, b] of same) {
    assert.equal(sameQuestion(a, b), true, `${a} | ${b}`);
  }
  for (const [a, b] of different) {
    assert.equal(sameQuestion(a, b), false, `${a} | ${b}`);
  }
  assert.equal(intentOf('Пришли почту'), 'accounts');
  assert.equal(intentOf('почти готово?'), null);
});

test('our questions are grouped by meaning, the most asked first', () => {
  hour = 0;
  const messages = [
    say('me', 'Где ты работаешь?'),
    say('7', 'В школе'),
    say('me', 'Как здоровье?'),
    say('7', 'Хорошо'),
    say('me', 'Кем ты сейчас работаешь?'),
    say('7', 'Учителем'),
    say('7', 'А ты где работаешь?'),
  ];
  const groups = groupQuestions(questionAnswers(messages));
  assert.equal(groups.length, 2);
  assert.equal(groups[0].asked, 2);
  assert.equal(groups[0].answered, 2);
  assert.deepEqual(groups[0].wordings, [
    'Где ты работаешь?',
    'Кем ты сейчас работаешь?',
  ]);
  assert.equal(groups[0].latest.answer.text, 'Учителем');
  const all = learnConversation(messages);
  assert.equal(all.questions.length, 4);
  assert.equal(all.asked.length, 2);
});

test('question grouping prepares each wording once per analysis and releases its cache scope', () => {
  const matcher = createQuestionMatcher();
  for (let n = 0; n < 6; n++) {
    assert.equal(matcher.matches('Ты программист?', 'Вы программист?'), true);
  }
  assert.deepEqual(matcher.stats(), { prepared: 2, comparisons: 6 });
  assert.deepEqual(createQuestionMatcher().stats(), {
    prepared: 0,
    comparisons: 0,
  });
});
