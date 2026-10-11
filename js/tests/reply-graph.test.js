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
  const whole = index.autocomplete({ lastMessage: 'Спасибо!' });
  assert.equal(whole.stage, 'reply');
  assert.equal(whole.suggestions[0].text, 'Пожалуйста, обращайтесь');

  const words = index.autocomplete({ lastMessage: 'Как жизнь?', typed: 'Пр' });
  assert.equal(words.stage, 'word');
  assert.equal(words.suggestions[0].text, 'Привет');
  assert.equal(words.suggestions[0].insert, 'ивет');

  const next = index.autocomplete({ typed: 'Привет, как ' });
  assert.equal(next.suggestions[0].word, 'дела');
  // One word typed: the word that followed it beats more frequent ones.
  const after = index.autocomplete({ typed: 'Пожалуйста, ' });
  assert.equal(after.suggestions[0].word, 'обращайтесь');

  assert.deepEqual(index.autocomplete({ lastMessage: 'zzz' }), {
    stage: 'none',
    suggestions: [],
  });
});

test('word-by-word learns from our own messages only by default', () => {
  const links = [msg('5', 'u5', 'Абракадабра', 0)];
  assert.equal(buildReplyIndex(links).suggestWords('Абр').length, 0);
  const all = buildReplyIndex(links, { wordsFrom: 'all' });
  assert.equal(all.suggestWords('Абр')[0].text, 'Абракадабра');
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
