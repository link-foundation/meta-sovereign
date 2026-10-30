import { test } from 'node:test';
import assert from 'node:assert/strict';
import { middleEllipsis } from '../src/web/middle-ellipsis.js';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const parts = (text) => Array.from(segmenter.segment(text), (s) => s.segment);
const measure = (text) => parts(text).length;

test('middle ellipsis preserves short labels and both ends of longer labels', () => {
  assert.equal(middleEllipsis('Hello', 5, measure), 'Hello');
  assert.equal(middleEllipsis('Hello world!', 9, measure), 'Hell…rld!');
  assert.equal(middleEllipsis('Hello world!', 20, measure), 'Hello world!');
  assert.equal(middleEllipsis('Hello world!', 1, measure), '…');
});

test('middle ellipsis never splits composed characters, flags or family emoji', () => {
  const text = '👩🏽‍💻Привет e\u0301 друзья 🇻🇳👨‍👩‍👧‍👦';
  const original = parts(text);
  for (let width = 3; width < original.length; width++) {
    const result = parts(middleEllipsis(text, width, measure));
    const at = result.indexOf('…');
    assert.ok(at > 0);
    assert.ok(result.length <= width);
    assert.deepEqual(result.slice(0, at), original.slice(0, at));
    assert.deepEqual(
      result.slice(at + 1),
      original.slice(-(result.length - at - 1))
    );
  }
});

test('middle ellipsis fits measured glyph widths rather than a character limit', () => {
  const pixels = (text) =>
    Array.from(text).reduce((sum, char) => sum + (char === 'W' ? 12 : 3), 0);
  const text = 'WWW narrow middle iii';
  const label = middleEllipsis(text, 60, pixels);
  assert.ok(label.startsWith('WW'));
  assert.ok(label.endsWith('iii'));
  assert.ok(pixels(label) <= 60);
});
