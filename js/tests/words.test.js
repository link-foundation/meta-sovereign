// Words and the gaps between them (R-Y57): the grammar that compares
// questions until link-assistant/formal-ai can (formal-ai#1330).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  foldWord,
  overlap,
  sameWords,
  stemOf,
  stemsOf,
  tokensOf,
  wordsOf,
} from '../src/crm/words.js';

test('every character belongs to one token: words, numbers or gaps', () => {
  const text = 'Кто-то придёт в 10:30? Don’t worry — 2.5 км 🙂';
  const tokens = tokensOf(text);
  assert.equal(tokens.map((t) => t.text).join(''), text);
  assert.deepEqual(
    tokens.filter((t) => t.kind !== 'gap').map((t) => `${t.kind}:${t.text}`),
    [
      'word:Кто-то',
      'word:придёт',
      'word:в',
      'number:10:30',
      'word:Don’t',
      'word:worry',
      'number:2.5',
      'word:км',
    ]
  );
  assert.equal(tokens.at(-1).kind, 'gap');
  assert.deepEqual(tokensOf(''), []);
  // A hyphen or apostrophe not followed by a letter is a gap.
  assert.deepEqual(wordsOf("rock- 'n roll'"), ['rock', 'n', 'roll']);
});

test('words are folded and stems drop the ending', () => {
  assert.equal(foldWord('Ещё'), 'еще');
  assert.deepEqual(wordsOf('Ну, ЁЛКИ!'), ['ну', 'елки']);
  assert.equal(stemOf('работаешь'), stemOf('работает'));
  assert.equal(stemOf('working'), stemOf('works'));
  assert.equal(stemOf('ты'), 'ты', 'short words stay whole');
});

test('the same words in another order, and how much two texts share', () => {
  assert.equal(sameWords('Как прошёл переезд?', 'как переезд прошел'), true);
  assert.equal(sameWords('Как прошёл переезд?', 'Как прошёл день?'), false);
  assert.equal(sameWords('?!', '...'), false, 'no words, nothing the same');
  const skip = new Set(['как']);
  assert.equal(
    overlap(
      stemsOf('Как прошёл переезд', skip),
      stemsOf('переезд прошёл?', skip)
    ),
    1
  );
  assert.equal(overlap(new Set(), new Set()), 0);
});
