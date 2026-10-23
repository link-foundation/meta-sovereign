// The emoji panel (R-Y104): Unicode's emoji by category, found by name,
// the recent ones first, a pick put in at the caret.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  emojiCategories,
  findEmoji,
  insertAtCaret,
  readTones,
  rememberTone,
  toneBases,
  tonedForm,
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

test('the emoji that take a skin tone, and their toned forms (R-Y114)', () => {
  assert.ok(toneBases.has('👍') && toneBases.has('👋'));
  assert.ok(!toneBases.has('😀'));
  assert.equal(tonedForm('👍', 3), '👍🏽');
  assert.equal(tonedForm('👍', 0), '👍');
  assert.equal(tonedForm('😀', 2), '😀', 'no tone for a face');
  // A trailing FE0F goes; a ZWJ sequence takes it after the person.
  assert.equal(tonedForm('☝️', 1), '☝🏻');
  assert.equal(tonedForm('🏃‍♂️', 5), '🏃🏿‍♂️');
  assert.equal(tonedForm('🏋️‍♀️', 2), '🏋🏼‍♀️');
});

test('a chosen tone is remembered per emoji, kept safely (R-Y114)', () => {
  const data = new Map();
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
  };
  assert.deepEqual(readTones(storage), {});
  let tones = rememberTone({}, '👍', 4, storage);
  tones = rememberTone(tones, '👋', 2, storage);
  assert.deepEqual(readTones(storage), { '👍': 4, '👋': 2 });
  assert.deepEqual(rememberTone(tones, '👍', 0, storage), { '👋': 2 });
  assert.deepEqual(readTones(storage), { '👋': 2 });
  data.set([...data.keys()][0], '{"😀":3,"👍":9}');
  assert.deepEqual(readTones(storage), {}, 'only real emoji and tones');
  const broken = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  assert.deepEqual(readTones(broken), {});
  assert.deepEqual(rememberTone({}, '👍', 1, broken), { '👍': 1 });
});
