// Provider-independent, bounded matching. Stored templates are data, never
// executable regexes. Approximate matches are suggestions requiring review.
import {
  isQuestion,
  MAX_QUESTION_LENGTH,
} from '../crm/question-recognition.js';
import { splitQuestionBlocks } from './question-lists.js';
import { sameQuestionSubjects } from './question-subjects.js';
import { textLinks } from '../message-links.js';
import { weightedQuestionSimilarity } from './question-weighted.js';
import {
  questionAction,
  questionInvitation,
} from './question-action-intent.js';

export { MAX_QUESTION_LENGTH } from '../crm/question-recognition.js';
const MAX_WORDS = 256;
const fold = (text, { caseSensitive = false } = {}) => {
  const value = String(text ?? '')
    .normalize('NFKC')
    .replace(/ё/g, 'е')
    .replace(/Ё/g, 'Е');
  return caseSensitive ? value : value.toLowerCase();
};
const WORD =
  /[$€£₽₹¥]|\.?[\p{L}\p{N}][\p{L}\p{M}\p{N}\u200c\u200d]*(?:[+#]{1,2}|(?:[./:@_-][\p{L}\p{N}][\p{L}\p{M}\p{N}\u200c\u200d]*)+)?/gu;
export const questionWords = (text, options) =>
  fold(text, options).match(WORD) ?? [];
export const questionKey = (text, options) =>
  questionWords(text, options).join(' ');
export const asksQuestion = isQuestion;

const extraIntent = (text) =>
  asksQuestion(text) ||
  questionAction.test(text) ||
  questionInvitation.test(text) ||
  /(?<!\p{L})(?:когда|почему|сколько|какая|какие|укажите|созвон\p{L}*|встреч\p{L}*|when|why|which)(?!\p{L})/iu.test(
    text
  );

const advancePattern = (states, token, { words, text, tail }, maxGap) => {
  const next = new Map();
  for (const [position, skipped] of states) {
    if (token === '…') {
      for (
        let size = 0;
        size <= maxGap - skipped && position + size <= words.length;
        size++
      ) {
        const end = position + size;
        // Keep punctuation between words so a skipped clause cannot look like
        // a continuation of the approved question. Leave terminal punctuation
        // to the whole-template check when a wildcard ends the message.
        if (
          size > 0 &&
          extraIntent(
            text.slice(words[position].index, words[end]?.index ?? tail)
          )
        ) {
          break;
        }
        next.set(end, Math.min(next.get(end) ?? Infinity, skipped + size));
      }
    } else if (
      position < words.length &&
      (token.endsWith('*')
        ? words[position][0].startsWith(token.slice(0, -1))
        : words[position][0] === token)
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
// A bare name such as example.zip may be a file or a domain. Either added
// interpretation needs review. Bare host casing is immaterial; paths are not.
const questionLinks = (text) =>
  textLinks(text, { includeFileNames: true }).map((link) =>
    /^[a-z][a-z\d+.-]*:/iu.test(link)
      ? link
      : link.replace(/^[^/?#:]+/u, (host) => host.toLowerCase())
  );
const invalidInputs = (pattern, text) =>
  typeof pattern !== 'string' ||
  typeof text !== 'string' ||
  pattern.length > MAX_QUESTION_LENGTH ||
  text.length > MAX_QUESTION_LENGTH ||
  // Token folding discards URL punctuation and path case. Bind full targets
  // before either exact normalization or wildcard expansion can hide a change.
  JSON.stringify(questionLinks(pattern)) !==
    JSON.stringify(questionLinks(text));
const invalidTemplateExpansion = (pattern, text, options) =>
  (text.match(/[?？]/gu)?.length ?? 0) >
    (pattern.match(/[?？]/gu)?.length ?? 0) ||
  !(options?.templateSubjects ?? sameQuestionSubjects)(pattern, text);

const matchTemplate = (pattern, text, options) => {
  const folded = fold(text, options);
  const words = [...folded.matchAll(WORD)];
  if (!words.length || words.length > MAX_WORDS) {
    return null;
  }
  const tokens =
    fold(pattern, options)
      .replace(/\.\.\./gu, '…')
      .match(
        /…|[$€£₽₹¥]|\.?[\p{L}\p{N}][\p{L}\p{M}\p{N}\u200c\u200d]*(?:[+#]{1,2}|(?:[./:@_-][\p{L}\p{N}][\p{L}\p{M}\p{N}\u200c\u200d]*)+)?\*?/gu
      ) ?? [];
  const fixed = tokens.filter((token) => token !== '…').length;
  if (!fixed || tokens.length > MAX_WORDS) {
    return null;
  }
  // Reject new question punctuation even if punctuation normalization hides it.
  if (invalidTemplateExpansion(pattern, text, options)) {
    return null;
  }
  const maxGap = Math.min(40, fixed * 3);
  const last = words.at(-1);
  const input = { words, text: folded, tail: last.index + last[0].length };
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
  return states.has(words.length) ? 'template' : null;
};

export const matchQuestion = (pattern, text, options) => {
  if (invalidInputs(pattern, text)) {
    return null;
  }
  if (/…|\*|\.\.\./u.test(pattern)) {
    return matchTemplate(pattern, text, options);
  }
  const words = questionWords(text, options);
  return words.length &&
    words.length <= MAX_WORDS &&
    questionKey(pattern, options) === words.join(' ')
    ? 'exact'
    : null;
};

const invalidWeightedInputs = (left, right, options) =>
  options?.algorithm === 'weighted' &&
  [left, right].some(
    (value) => typeof value !== 'string' || value.length > MAX_QUESTION_LENGTH
  );

/** Similarity suggestions never qualify for automatic reuse. */
export const questionSimilarity = (left, right, budget, options) => {
  if (invalidWeightedInputs(left, right, options)) {
    return 0;
  }
  const a = questionWords(left, options);
  const b = questionWords(right, options);
  if (!a.length || !b.length || a.length > MAX_WORDS || b.length > MAX_WORDS) {
    return 0;
  }
  if (!sameQuestionSubjects(left, right)) {
    return 0;
  }
  if (options?.algorithm === 'weighted') {
    return weightedQuestionSimilarity(a, b, budget, options);
  }
  // Optional shared batch budget. Exhaustion leaves approximate answers for
  // explicit review; standalone/chat matching keeps its existing behavior.
  if (budget) {
    const cost = a.length * b.length;
    if (cost > budget.remaining) {
      budget.exhausted = true;
      return 0;
    }
    budget.remaining -= cost;
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
