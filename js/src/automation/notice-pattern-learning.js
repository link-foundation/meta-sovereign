// Derive review-only data patterns from observed notice/reply pairs. Keep the
// original records and counts; generated patterns never become owner aliases.
import { lcs } from '../patterns/index.js';
import {
  questionKey,
  questionWords,
  questionSimilarity,
} from './question-match.js';
import {
  noticeCore,
  passiveNotice,
  matchNotice,
  NO_NOTICE_REPLY,
} from './question-notices.js';

const stem = (word) =>
  /^[\p{L}\p{M}]{5,}$/u.test(word) ? [...word].slice(0, 4).join('') : word;
const negative = (text) =>
  /(?:^|[^\p{L}])(?:not|no|never|не|нет|नहीं)(?:$|[^\p{L}])|不|没/iu.test(text);
const numbers = (text) =>
  questionWords(text)
    .filter((word) => /\p{N}/u.test(word))
    .join('\0');
const charge = (budget, cells) => {
  budget.remaining -= cells;
  if (budget.remaining < 0 || budget.exhausted) {
    throw new Error(
      'notice pattern learning capacity exceeded; no proposals applied'
    );
  }
};
const similarReply = (left, right, budget) => {
  if (--budget.comparisons < 0) {
    charge(budget, Infinity);
  }
  if (questionKey(left) === questionKey(right)) {
    return true;
  }
  if (negative(left) !== negative(right) || numbers(left) !== numbers(right)) {
    return false;
  }
  const similarity = questionSimilarity(left, right, budget);
  charge(budget, 0);
  return similarity >= 0.85;
};
const prefixToken = (left, right) => {
  if (left === right) {
    return left;
  }
  const a = [...left],
    b = [...right];
  let length = 0;
  while (length < Math.min(a.length, b.length) && a[length] === b[length]) {
    length++;
  }
  return length >= 4 && length / Math.max(a.length, b.length) >= 0.5
    ? `${a.slice(0, length).join('')}*`
    : null;
};
const alignedPattern = (a, b, shared) => {
  let i = 0,
    j = 0;
  const parts = [];
  for (const word of shared) {
    const nextA = a.findIndex((value, at) => at >= i && stem(value) === word);
    const nextB = b.findIndex((value, at) => at >= j && stem(value) === word);
    const token = prefixToken(a[nextA], b[nextB]);
    if (!token) {
      return null;
    }
    if (nextA > i || nextB > j) {
      parts.push('…');
    }
    parts.push(token);
    i = nextA + 1;
    j = nextB + 1;
  }
  if (i < a.length || j < b.length) {
    parts.push('…');
  }
  return parts.join(' ');
};
const patternFor = (left, right, budget) => {
  const a = left.words,
    b = right.words;
  charge(budget, a.length * b.length);
  if (a.length === 1 && b.length === 1 && /\p{Script=Han}/u.test(a[0] + b[0])) {
    const prefix = prefixToken(a[0], b[0]);
    return prefix?.endsWith('*') ? prefix : null;
  }
  const shared = lcs(a.map(stem), b.map(stem));
  if (
    shared.filter((word) => [...word].length >= 4).length < 4 ||
    shared.length / Math.max(a.length, b.length) < 0.45
  ) {
    return null;
  }
  const pattern = alignedPattern(a, b, shared);
  return pattern &&
    /…|\*/u.test(pattern) &&
    matchNotice(pattern, left.text) &&
    matchNotice(pattern, right.text)
    ? pattern
    : null;
};
const observations = (rules) =>
  rules
    .flatMap((rule) => {
      if (rule.kind !== 'notice' || !passiveNotice(rule.question)) {
        return [];
      }
      const text = noticeCore(rule.question);
      const words = questionWords(text);
      const replies = rule.answers
        .filter(
          (answer) => answer.count > 0 && answer.text.trim() !== NO_NOTICE_REPLY
        )
        .map((answer) => answer.text);
      return words.length > 0 && words.length <= 256 && replies.length
        ? [{ rule, text, words, replies }]
        : [];
    })
    .sort((a, b) => a.rule.id.localeCompare(b.rule.id));

/** Atomic finite synthesis; exhaustion refuses learning before any writes. */
export const withNoticePatterns = (
  rules,
  { maxCells = 4 * 1024 ** 2, maxComparisons = 100000 } = {}
) => {
  const entries = observations(rules);
  const patterns = new Map(entries.map((entry) => [entry.rule.id, new Set()]));
  const budget = {
    remaining: maxCells,
    exhausted: false,
    comparisons: maxComparisons,
  };
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i],
        b = entries[j];
      if (
        !a.replies.some((left) =>
          b.replies.some((right) => similarReply(left, right, budget))
        )
      ) {
        continue;
      }
      const pattern = patternFor(a, b, budget);
      if (!pattern) {
        continue;
      }
      for (const entry of [a, b]) {
        const saved = patterns.get(entry.rule.id);
        saved.add(pattern);
        if (saved.size > 100) {
          charge(budget, Infinity);
        }
      }
    }
  }
  return rules.map((rule) =>
    rule.kind === 'notice'
      ? { ...rule, learnedPatterns: [...(patterns.get(rule.id) ?? [])].sort() }
      : rule
  );
};
