// Issue #31 / PR #34: the message-to-message reply graph and two-stage
// autocomplete — whole replies to the last message first (deduplicated,
// most used first), word-by-word from our own messages when none match.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReplyIndex,
  createReplyIndex,
  extractReplyPairs,
  lastIncomingIn,
  normalizeMessage,
} from '../src/replies/reply-graph.js';

let seq = 0;
const msg = (chat, sender, body, minute, extra = {}) => ({
  id: `msg:vk:${++seq}`,
  source: 'vk',
  chat,
  sender,
  body,
  timestamp: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(),
  ...extra,
});

const history = () => [
  msg('1', 'u1', 'Привет!', 0),
  msg('1', 'me', 'Привет, как дела?', 1),
  msg('2', 'u2', 'привет', 0),
  msg('2', 'me', 'Привет, как дела?', 2),
  msg('3', 'u3', 'Привет', 0),
  msg('3', 'me', 'Здравствуйте!', 3),
  msg('4', 'u4', 'Спасибо', 0),
  msg('4', 'me', 'Пожалуйста, обращайтесь', 1),
];

test('normalizeMessage ignores case, punctuation and ё', () => {
  assert.equal(normalizeMessage('  Привет!!! '), 'привет');
  assert.equal(normalizeMessage('Всё хорошо :)'), 'все хорошо');
});

test('extractReplyPairs pairs a partner message with our next one', () => {
  const pairs = extractReplyPairs(history());
  assert.equal(pairs.length, 4);
  assert.deepEqual(
    pairs.map((p) => [p.prompt, p.reply]).sort(),
    [
      ['Привет', 'Здравствуйте!'],
      ['Привет!', 'Привет, как дела?'],
      ['Спасибо', 'Пожалуйста, обращайтесь'],
      ['привет', 'Привет, как дела?'],
    ].sort()
  );
});

test('extractReplyPairs honours replyTo and the reply window', () => {
  const asked = msg('9', 'u9', 'Когда созвон?', 0);
  const links = [
    asked,
    msg('9', 'u9', 'Кстати, привет', 1),
    msg('9', 'me', 'В пятницу', 2, { replyTo: asked.id.split(':')[2] }),
    msg('8', 'u8', 'Ау', 0),
    { ...msg('8', 'me', 'Поздно', 0), timestamp: '2026-03-01T00:00:00Z' },
  ];
  const pairs = extractReplyPairs(links);
  assert.deepEqual(
    pairs.map((p) => [p.prompt, p.reply]),
    [['Когда созвон?', 'В пятницу']]
  );
});

test('suggestReplies is deduplicated and sorted by use', () => {
  const index = buildReplyIndex(history());
  const out = index.suggestReplies('ПРИВЕТ');
  assert.deepEqual(
    out.map((s) => [s.text, s.count]),
    [
      ['Привет, как дела?', 2],
      ['Здравствуйте!', 1],
    ]
  );
  assert.equal(out[0].kind, 'reply');
  // What the user typed narrows the list by prefix.
  assert.deepEqual(
    index.suggestReplies('привет', { typed: 'здр' }).map((s) => s.text),
    ['Здравствуйте!']
  );
});

test('autocomplete tries whole replies first, then words', () => {
  const index = buildReplyIndex(history());
  const whole = index.autocomplete({ lastMessage: 'Привет' });
  assert.equal(whole.stage, 'reply');
  assert.deepEqual(
    whole.suggestions.map((s) => s.text),
    ['Привет, как дела?']
  );
  // Before typing only typical replies: a reply given once is not one,
  // and shows once its start is typed.
  assert.equal(index.autocomplete({ lastMessage: 'Спасибо!' }).stage, 'none');
  assert.equal(
    index.autocomplete({ lastMessage: 'Спасибо!', typed: 'По' }).suggestions[0]
      .text,
    'Пожалуйста, обращайтесь'
  );

  // Typing: a whole message we sent that starts so comes first, then
  // the words.
  const typing = index.autocomplete({ lastMessage: 'Как жизнь?', typed: 'Пр' });
  assert.equal(typing.stage, 'message');
  assert.equal(typing.suggestions[0].text, 'Привет, как дела?');
  const word = typing.suggestions.find((s) => s.kind === 'word');
  assert.equal(word.text, 'Привет');
  assert.equal(word.insert, 'ивет');

  // A word that only finishes a whole suggestion is not offered twice.
  const next = index.autocomplete({ typed: 'Привет, как ' });
  assert.deepEqual(next.suggestions[0], {
    kind: 'message',
    text: 'Привет, как дела?',
    count: 2,
    lastUsed: next.suggestions[0].lastUsed,
  });
  assert.ok(!next.suggestions.some((s) => s.word === 'дела'));
  assert.equal(index.suggestWords('Привет, как ')[0].word, 'дела');
  // Like a keyboard's strip: whole replies may be many, words three.
  const strip = index.autocomplete({ typed: 'Привет, ' });
  assert.ok(strip.suggestions.filter((s) => s.kind === 'word').length <= 3);
  assert.ok(index.suggestWords('Привет, ', { limit: 8 }).length > 3);
  // One word typed: the word that followed it beats more frequent ones.
  assert.equal(index.suggestWords('Пожалуйста, ')[0].word, 'обращайтесь');

  assert.deepEqual(index.autocomplete({ lastMessage: 'zzz' }), {
    stage: 'none',
    suggestions: [],
  });
});

test('generated next words are not claimed as historical whole messages', () => {
  const sent = [
    'И начнем обсуждение.',
    'Я подготовлю материалы.',
    'А затем договоримся.',
  ];
  const index = buildReplyIndex(sent.map((body, n) => msg('1', 'me', body, n)));
  const copy = createReplyIndex().fromLinks(index.modelLinks());
  const typed = 'Привет\nМожешь помочь с настройкой учебного проекта? ';
  for (const model of [index, copy]) {
    const result = model.autocomplete({ typed });
    assert.equal(result.stage, 'word');
    assert.deepEqual(
      result.suggestions.map((s) => s.word),
      ['Начнем', 'Обсуждение', 'Подготовлю']
    );
    for (const s of result.suggestions) {
      assert.equal(s.kind, 'word');
      assert.equal(s.text, `${typed}${s.insert}`);
      assert.ok(!sent.includes(s.text));
    }
    assert.deepEqual(model.suggestMessages(typed), []);
    assert.deepEqual(
      model.suggestWords(typed.trimEnd()),
      [],
      'a finished sentence has no word strip'
    );
  }
});

test('word-by-word stays inside a sentence and spells words as used in one', () => {
  const index = createReplyIndex();
  for (const body of [
    'Отлично. А ты как?',
    'Отлично. А у тебя?',
    'Отлично, спасибо',
    'Передай привет Ане',
    'Ане тоже',
  ]) {
    index.learnFromMessages([msg('1', 'me', body, 0)]);
  }
  // "А" opened a new sentence: it never follows "отлично" in one, and
  // the word just typed is not offered again.
  const next = index.suggestWords('Отлично, ').map((s) => s.word);
  assert.equal(next[0], 'спасибо');
  assert.ok(!next.includes('Отлично') && !next.includes('А'));
  // Mid-sentence words keep their lower case, names their capital…
  const later = index.suggestWords('Отлично, спасибо ').map((s) => s.word);
  assert.ok(
    !later.includes('а') && !later.includes('А'),
    'single-letter words are not useful completions'
  );
  assert.equal(index.suggestWords('Привет ')[0].word, 'Ане');
  // …and after a full stop the sentence openers come first, capitalised.
  assert.equal(index.suggestWords('Хорошо. ')[0].word, 'Отлично');
  assert.ok(!index.suggestWords('Хорошо. ').some((s) => s.word === 'А'));
});

test('words come from both sides of a conversation, ours weighing more', () => {
  const links = [msg('5', 'u5', 'Абракадабра', 0), msg('5', 'me', 'Да', 1)];
  assert.equal(
    buildReplyIndex(links).suggestWords('Абр')[0].text,
    'Абракадабра'
  );
  // A chat we never wrote in is not our conversation.
  const unread = buildReplyIndex([msg('9', 'u9', 'Абракадабра', 0)]);
  assert.equal(unread.suggestWords('Абр').length, 0);
  const own = buildReplyIndex(links, { wordsFrom: 'self' });
  assert.equal(own.suggestWords('Абр').length, 0);
  const both = buildReplyIndex([
    msg('5', 'u5', 'Абракадабра', 0),
    msg('5', 'u5', 'Абракадабра', 1),
    msg('5', 'me', 'Абрикос', 2),
  ]);
  assert.deepEqual(
    both.suggestWords('Абр').map((s) => s.word),
    ['Абрикос', 'Абракадабра']
  );
  // A broadcast channel's posts teach no words; deleted messages neither.
  const channel = buildReplyIndex([
    { ...msg('6', 'c6', 'Абсолютно', 0), chatType: 'channel' },
    { ...msg('7', 'me', 'Абзац', 0), deleted: true },
  ]);
  assert.equal(channel.suggestWords('Аб').length, 0);
});

test('whole messages we sent complete what is typed, most used first', () => {
  const index = buildReplyIndex([
    msg('1', 'me', 'Ну если ты про тот бенчмарк', 0),
    msg('2', 'me', 'Нужно проверить', 1),
    msg('3', 'me', 'Нужно проверить', 2),
    msg('4', 'u4', 'Ну и ну', 3),
  ]);
  assert.deepEqual(
    index.suggestMessages('Ну').map((s) => [s.text, s.count]),
    [
      ['Нужно проверить', 2],
      ['Ну если ты про тот бенчмарк', 1],
    ]
  );
  // A finished word only matches messages with that word.
  assert.deepEqual(
    index.suggestMessages('Ну ').map((s) => s.text),
    ['Ну если ты про тот бенчмарк']
  );
  // One letter is too little; a message typed in full is not offered.
  assert.equal(index.suggestMessages('Н').length, 0);
  assert.equal(index.suggestMessages('нужно проверить!').length, 0);
});

test('observe learns pairs in real time', () => {
  const index = createReplyIndex();
  assert.equal(index.observe(msg('7', 'u7', 'Есть минутка?', 0)), null);
  const pair = index.observe(msg('7', 'me', 'Да, конечно', 1));
  assert.deepEqual([pair.prompt, pair.reply], ['Есть минутка?', 'Да, конечно']);
  // An older message arriving late teaches no pair.
  assert.equal(index.observe(msg('7', 'u7', 'Старое', -5)), null);
  assert.equal(index.suggestReplies('есть минутка')[0].text, 'Да, конечно');
});

test('toLinks / fromLinks round-trip the counts', () => {
  const index = buildReplyIndex(history());
  const links = index.toLinks();
  assert.ok(links.every((l) => l.id.startsWith('reply-link:')));
  assert.deepEqual(links[0].tokens.slice(0, 1), ['reply-link']);
  const copy = createReplyIndex().fromLinks(links);
  assert.deepEqual(
    copy.suggestReplies('привет'),
    index.suggestReplies('привет')
  );
  assert.deepEqual(copy.stats().pairs, index.stats().pairs);
});

test('lastIncomingIn finds the message we are about to answer', () => {
  const links = history();
  assert.equal(
    lastIncomingIn(links, { source: 'vk', chat: '4' }).body,
    'Спасибо'
  );
  assert.equal(lastIncomingIn(links, { source: 'vk', chat: 'x' }), null);
});
