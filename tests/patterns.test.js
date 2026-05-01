import { describe, it, expect } from 'test-anywhere';
import {
  inferRegex,
  simplifyRegex,
  matchAll,
  inferRegexLcs,
  lcs,
  compilePeg,
} from '../src/patterns/index.js';
import {
  dice,
  findCandidates,
  createReplyGroup,
  pickVariation,
} from '../src/replies/index.js';

describe('inferRegex', () => {
  it('finds shared tokens', () => {
    const r = inferRegex(['hi how are you', 'hi how is it']);
    expect(r.test('hi how am here')).toBe(true);
    expect(r.test('bye how are you')).toBe(false);
  });
  it('falls back to alternation when lengths differ', () => {
    const r = inferRegex(['hello', 'hi there']);
    expect(r.test('hello')).toBe(true);
    expect(r.test('hi there')).toBe(true);
    expect(r.test('something else entirely')).toBe(false);
  });
  it('matches all messages it should', () => {
    const r = inferRegex(['can you help me', 'can you help him']);
    expect(matchAll(r, ['can you help her', 'no']).length).toBe(1);
  });
});

describe('simplifyRegex', () => {
  it('returns a regex', () => {
    const r = inferRegex(['a b c', 'a x y']);
    expect(simplifyRegex(r) instanceof RegExp).toBe(true);
  });
});

describe('lcs / inferRegexLcs / compilePeg', () => {
  it('lcs finds the longest shared subsequence', () => {
    expect(lcs(['a', 'b', 'c'], ['x', 'a', 'y', 'c']).join(',')).toBe('a,c');
  });
  it('inferRegexLcs handles different-length examples', () => {
    const r = inferRegexLcs([
      'hi alice how are you',
      'hi bob and carol how are you doing',
    ]);
    expect(r.test('hi dave how are you')).toBe(true);
    expect(r.test('bye dave how are you')).toBe(false);
  });
  it('inferRegexLcs picks digit class when all gaps are numeric', () => {
    const r = inferRegexLcs(['order 17 confirmed', 'order 4242 confirmed']);
    expect(r.test('order 9 confirmed')).toBe(true);
    expect(r.test('order ABC confirmed')).toBe(false);
  });
  it('compilePeg produces a working regex with named captures', () => {
    const r = compilePeg(['hello', { capture: 'name', class: '\\w+' }]);
    const m = 'hello alice'.match(r);
    expect(m?.groups?.name).toBe('alice');
  });
});

describe('replies', () => {
  it('dice similarity is symmetric', () => {
    expect(dice('hello', 'hello')).toBe(1);
    expect(dice('abc', 'xyz')).toBe(0);
  });
  it('finds candidates above threshold', () => {
    const history = [{ body: 'thanks a lot' }, { body: 'see you later' }];
    const c = findCandidates(history, 'thanks lot');
    expect(c.length >= 1).toBe(true);
  });
  it('pickVariation returns one of the variations', () => {
    const g = createReplyGroup({
      id: 'g1',
      label: 'greet',
      variations: ['hi', 'hello'],
    });
    expect(['hi', 'hello'].includes(pickVariation(g, 'first'))).toBe(true);
  });
});
