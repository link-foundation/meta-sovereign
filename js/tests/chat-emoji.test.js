// The emoji panel (R-Y104): Unicode's emoji by category, found by name,
// the recent ones first, a pick put in at the caret.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  emojiCategories,
  findEmoji,
  insertAtCaret,
  withRecent,
} from '../src/web/chat-emoji.js';

test("the categories, in Telegram's order, each with its emoji (R-Y104)", () => {
  const categories = emojiCategories();
  assert.deepEqual(
    categories.map((c) => c.key),
    [
      'people',
      'nature',
      'food',
      'activity',
      'travel',
      'objects',
      'symbols',
      'flags',
    ]
  );
  const total = categories.reduce((n, c) => n + c.list.length, 0);
  assert.ok(total > 1500, `${total} emoji`);
  assert.deepEqual(categories[0].list[0], {
    emoji: '😀',
    name: 'grinning face',
  });
  const all = categories.flatMap((c) => c.list.map((i) => i.emoji));
  assert.equal(new Set(all).size, all.length, 'each once');
  assert.ok(
    !all.some((e) => /[\u{1F3FB}-\u{1F3FF}]/u.test(e)),
    'no skin tones'
  );
});

test('found by every word of the name (R-Y104)', () => {
  assert.deepEqual(
    findEmoji('red heart').map((i) => i.emoji),
    ['❤️']
  );
  assert.ok(findEmoji('CAT').some((i) => i.emoji === '🐈'));
  assert.deepEqual(findEmoji('  '), []);
  assert.deepEqual(findEmoji('no such emoji at all'), []);
  assert.equal(findEmoji('face', 5).length, 5);
});

test('the recent ones: the newest first, once each, a few (R-Y104)', () => {
  assert.deepEqual(withRecent(['😀', '😂'], '😂'), ['😂', '😀']);
  const many = Array.from({ length: 40 }, (_, i) => String(i));
  assert.equal(withRecent(many, 'x').length, 32);
  assert.equal(withRecent(many, 'x')[0], 'x');
});

test('a pick goes in at the caret, over the selection (R-Y104)', () => {
  let set = null;
  const area = {
    value: 'hello world',
    selectionStart: 6,
    selectionEnd: 11,
    focus() {},
    setSelectionRange() {},
  };
  insertAtCaret(area, '🌍', (next) => {
    set = next;
  });
  assert.equal(set, 'hello 🌍');
  insertAtCaret(null, '🌍', () => assert.fail('no box'));
});
