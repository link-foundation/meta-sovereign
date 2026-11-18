import test from 'node:test';
import assert from 'node:assert/strict';
import { telegramPostFormat } from '../src/sources/telegram-post-format.js';
import { formattedParts, sendText } from '../src/sources/telegram-send.js';

test('explicit Telegram plaintext preserves markdown and HTML characters literally', () => {
  assert.deepEqual(telegramPostFormat('**literal** <b>x</b>', 'plain'), {
    text: '**literal** <b>x</b>',
    entities: [],
  });
  assert.equal(telegramPostFormat('**legacy**').text, 'legacy');
});

test('Telegram HTML produces nested entities with decoded text and UTF-16 offsets', () => {
  assert.deepEqual(telegramPostFormat('😀 <b>A &amp; <i>B</i></b>', 'html'), {
    text: '😀 A & B',
    entities: [
      { type: 'bold', offset: 3, length: 5 },
      { type: 'italic', offset: 7, length: 1 },
    ],
  });
  const result = telegramPostFormat(
    '<pre><code class="language-js">a &lt; b</code></pre> <a href="https://example.com/?a=1&amp;b=2">link</a>',
    'html'
  );
  assert.equal(result.text, 'a < b link');
  assert.deepEqual(result.entities, [
    { type: 'pre', offset: 0, length: 5, language: 'js' },
    { type: 'link', offset: 6, length: 4, url: 'https://example.com/?a=1&b=2' },
  ]);
});

test('Telegram HTML supports aliases, spoiler, expandable quotes and custom emoji', () => {
  const result = telegramPostFormat(
    '<strong>b</strong><em>i</em><ins>u</ins><del>s</del><span class="tg-spoiler">x</span><blockquote expandable>q</blockquote><tg-emoji emoji-id="123">👍</tg-emoji>',
    'html'
  );
  assert.equal(result.text, 'biusxq👍');
  assert.deepEqual(
    result.entities.map((entity) => entity.type),
    [
      'bold',
      'italic',
      'underline',
      'strike',
      'spoiler',
      'blockquote',
      'customEmoji',
    ]
  );
  assert.equal(result.entities[5].collapsed, true);
  assert.equal(result.entities[6].documentId, '123');
  assert.equal(result.entities[6].length, 2);
});

test('Telegram HTML rejects malformed, unsupported and unsafe markup before sending', () => {
  for (const html of [
    '<b>unclosed',
    '<script>x</script>',
    '<constructor>x</constructor>',
    '<toString>x</toString>',
    '<a href="javascript:alert(1)">x</a>',
    '<b><i>x</b></i>',
    '<code><b>x</b></code>',
    '<!--comment-->x',
    '<tg-emoji emoji-id="wrong">x</tg-emoji>',
    '<blockquote><blockquote>x</blockquote></blockquote>',
    `${'<b>'.repeat(65)}x${'</b>'.repeat(65)}`,
  ]) {
    assert.throws(
      () => telegramPostFormat(html, 'html'),
      { code: 'bad-draft' },
      html
    );
  }
});

test('explicit Telegram HTML and plain modes share the existing bounded part splitter', () => {
  const parts = formattedParts('<b>abcdefghij</b>', 6, 'html');
  assert.deepEqual(
    parts.map((part) => part.text),
    ['abcdef', 'ghij']
  );
  assert.deepEqual(
    parts.map((part) => part.entities[0].length),
    [6, 4]
  );
  assert.deepEqual(formattedParts('**literal**', 4096, 'plain'), [
    { text: '**literal**', entities: [] },
  ]);
});

test('MTProto sends explicit HTML entities and keeps explicit plaintext unchanged', async () => {
  const sent = [];
  class Bold {
    constructor(fields) {
      Object.assign(this, fields);
    }
  }
  const client = {
    async sendMessage(peer, options) {
      sent.push({ peer, ...options });
      return { id: sent.length };
    },
  };
  await sendText({
    client,
    Api: { MessageEntityBold: Bold },
    peer: '-10042',
    text: '<b>News</b>',
    format: 'html',
  });
  assert.equal(sent[0].message, 'News');
  assert.equal(sent[0].parseMode, false);
  assert.ok(sent[0].formattingEntities[0] instanceof Bold);
  assert.equal(sent[0].formattingEntities[0].length, 4);
  await sendText({
    client,
    peer: '-10042',
    text: '**literal**',
    format: 'plain',
  });
  assert.equal(sent[1].message, '**literal**');
  assert.equal(sent[1].formattingEntities, undefined);
});
