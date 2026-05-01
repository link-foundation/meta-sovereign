import { describe, it, expect } from 'test-anywhere';
import { inferRegex, simplifyRegex, matchAll } from '../src/patterns/index.js';
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
