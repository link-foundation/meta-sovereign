// Provider-independent, bounded matching. Stored templates are data, never
// executable regexes. Approximate matches are suggestions requiring review.
import {
  isQuestion,
  MAX_QUESTION_LENGTH,
} from '../crm/question-recognition.js';
import { splitQuestionBlocks } from './question-lists.js';

export { MAX_QUESTION_LENGTH } from '../crm/question-recognition.js';
const MAX_WORDS = 256;
const fold = (text) =>
  String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ё/g, 'е');
export const questionWords = (text) =>
  fold(text).match(
    /[$€£₽₹¥]|\.?[\p{L}\p{N}][\p{L}\p{M}\p{N}\u200c\u200d]*(?:[+#]{1,2}|(?:[./:@_-][\p{L}\p{N}][\p{L}\p{M}\p{N}\u200c\u200d]*)+)?/gu
  ) ?? [];
export const questionKey = (text) => questionWords(text).join(' ');
export const asksQuestion = isQuestion;

const extraIntent = (text) =>
  asksQuestion(text) ||
  /[?？]|https?:|www\.|(?:^|\s)(?:когда|почему|сколько|какая|какие|пришлите|укажите|созвон|встреч|анкет|задани|приглаш|when|why|which|send|call|interview|form|assignment|invite)[\p{L}]*/iu.test(
    text
  );

const advancePattern = (states, token, input, maxGap) => {
  const next = new Map();
  for (const [position, skipped] of states) {
    if (token === '…') {
      for (
        let size = 0;
        size <= maxGap - skipped && position + size <= input.length;
        size++
      ) {
        if (extraIntent(input.slice(position, position + size).join(' '))) {
          break;
        }
        const end = position + size;
        next.set(end, Math.min(next.get(end) ?? Infinity, skipped + size));
      }
    } else if (
      position < input.length &&
      (token.endsWith('*')
        ? input[position].startsWith(token.slice(0, -1))
        : input[position] === token)
    ) {
      next.set(
        position + 1,
        Math.min(next.get(position + 1) ?? Infinity, skipped)
      );
    }
  }
  return next;
};

/** Exact normalized text, or an explicitly saved whole-message template. */
const invalidInputs = (pattern, text) =>
  typeof pattern !== 'string' ||
  typeof text !== 'string' ||
  pattern.length > MAX_QUESTION_LENGTH ||
  text.length > MAX_QUESTION_LENGTH;
const extraQuestionMarks = (pattern, text) =>
  (text.match(/[?？]/gu)?.length ?? 0) >
  (pattern.match(/[?？]/gu)?.length ?? 0);

export const matchQuestion = (pattern, text) => {
  if (invalidInputs(pattern, text)) {
    return null;
  }
  const input = questionWords(text);
  if (!input.length || input.length > MAX_WORDS) {
    return null;
  }
  if (!/…|\*|\.\.\./u.test(pattern)) {
    return questionKey(pattern) === input.join(' ') ? 'exact' : null;
  }
  const tokens =
    fold(pattern)
      .replace(/\.\.\./gu, '…')
      .match(
        /…|[$€£₽₹¥]|\.?[\p{L}\p{N}][\p{L}\p{M}\p{N}\u200c\u200d]*(?:[+#]{1,2}|(?:[./:@_-][\p{L}\p{N}][\p{L}\p{M}\p{N}\u200c\u200d]*)+)?\*?/gu
      ) ?? [];
  const fixed = tokens.filter((token) => token !== '…').length;
  if (!fixed || tokens.length > MAX_WORDS) {
    return null;
  }
  // Reject new question punctuation even if punctuation normalization hides it.
  if (extraQuestionMarks(pattern, text)) {
    return null;
  }
  const maxGap = Math.min(40, fixed * 3);
  // Keep one cheapest path per input position: O(pattern * words * maxGap).
  let states = new Map([[0, 0]]);
  for (const token of tokens) {
    states = advancePattern(states, token, input, maxGap);
    if (!states.size) {
      return null;
    }
  }
  // Links must not become innocuous words after tokenization.
  if (/https?:|www\./iu.test(text) && !/https?:|www\./iu.test(pattern)) {
    return null;
  }
  return states.has(input.length) ? 'template' : null;
};

/** Ordered token similarity; its result never qualifies for automatic reuse. */
export const questionSimilarity = (left, right) => {
  const a = questionWords(left);
  const b = questionWords(right);
  if (!a.length || !b.length || a.length > MAX_WORDS || b.length > MAX_WORDS) {
    return 0;
  }
  let previous = new Uint16Array(b.length + 1);
  for (const word of a) {
    const row = new Uint16Array(b.length + 1);
    for (let j = 1; j <= b.length; j++) {
      row[j] =
        word === b[j - 1]
          ? previous[j - 1] + 1
          : Math.max(previous[j], row[j - 1]);
    }
    previous = row;
  }
  return (2 * previous[b.length]) / (a.length + b.length);
};

export const splitQuestions = splitQuestionBlocks;
