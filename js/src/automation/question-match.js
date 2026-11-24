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
const MAX_TEMPLATE_TOKENS = 2 * MAX_WORDS + 1;
const fold = (text, { caseSensitive = false } = {}) => {
  const value = String(text ?? '')
    .normalize('NFKC')
    .replace(/ё/g, 'е')
    .replace(/Ё/g, 'Е');
  return caseSensitive ? value : value.toLowerCase();
};
const WORD =
  /[$€£₽₹¥]|\.?[\p{L}\p{N}][\p{L}\p{M}\p{N}\u200c\u200d]*(?:[+#]{1,2}|(?:[./:@_-][\p{L}\p{N}][\p{L}\p{M}\p{N}\u200c\u200d]*)+)?/gu;
const BOUNDARY = String.raw`\?|(?<sentence>[.!。।]+|\r?\n[^\S\r\n]*\r?\n)`;
const MESSAGE_TOKEN = new RegExp(`(?:${WORD.source})|${BOUNDARY}`, 'gu');
const PATTERN_TOKEN = new RegExp(`…|(?:${WORD.source})\\*?|${BOUNDARY}`, 'gu');
export const questionWords = (text, options) =>
  fold(text, options).match(WORD) ?? [];
export const questionKey = (text, options) =>
  questionWords(text, options).join(' ');
export const asksQuestion = isQuestion;

const extraIntent = (text) =>
  text
    .split(
      /[,，;；]|(?<=[吗呢])(?=\p{Script=Han})|\s+(?:and|or|but|а|и|или|और|या)\s+/iu
    )
    .some(asksQuestion) ||
  questionAction.test(text) ||
  questionInvitation.test(text) ||
  /(?<!\p{L})(?:когда|почему|сколько|какая|какие|укажите|созвон\p{L}*|встреч\p{L}*|when|why|which)(?!\p{L})/iu.test(
    text
  );

const abbreviation = (stop, previous) =>
  stop[0] === '.' &&
  previous &&
  previous.index + previous[0].length === stop.index &&
  /^(?:\p{L}\.)+\p{L}$/u.test(previous[0]);

const templateTokens = (text, expression) => {
  const matches = [...text.matchAll(expression)];
  return matches.flatMap((match, index) => {
    // A terminal full stop or the dot in a.m. does not separate two clauses.
    if (
      match.groups.sentence &&
      (index === matches.length - 1 || abbreviation(match, matches[index - 1]))
    ) {
      return [];
    }
    return [
      {
        value: match.groups.sentence ? '.' : match[0],
        index: match.index,
        end: match.index + match[0].length,
      },
    ];
  });
};

export const questionClauseTokens = (text) =>
  templateTokens(fold(text).trim(), MESSAGE_TOKEN).map(({ value }) => value);

const isBoundary = (token) => token === '?' || token === '.';

const prefixMatches = (stem, words, position) => {
  const token = words[position]?.value;
  if (!token?.startsWith(stem)) {
    return false;
  }
  // A suffix may contain a complete request, including in scripts that do
  // not put spaces between words. Token joiners can also hide a clause start.
  const suffix = token.slice(stem.length);
  const phrase = suffix.replace(/[./:@_-]+/gu, ' ');
  const following = words[position + 1]?.value;
  return (
    !extraIntent(phrase) &&
    (phrase === suffix ||
      !following ||
      isBoundary(following) ||
      !asksQuestion(`${phrase} ${following}`))
  );
};

const nextFixedPosition = (words, position, expected) => {
  // A plain-text question may omit the final mark after all its words.
  if (expected === '?' && position === words.length) {
    return position;
  }
  const matches = expected.endsWith('*')
    ? prefixMatches(expected.slice(0, -1), words, position)
    : words[position]?.value === expected;
  return matches ? position + 1 : null;
};

const advancePattern = (states, token, words, text, maxGap) => {
  const next = new Map();
  for (const [position, skipped] of states) {
    if (token === '…') {
      for (
        let size = 0;
        size <= maxGap - skipped && position + size <= words.length;
        size++
      ) {
        const end = position + size;
        // Only the saved pattern can consume a question mark or sentence break.
        if (
          size > 0 &&
          (isBoundary(words[end - 1].value) ||
            extraIntent(
              text.slice(
                words[position].index,
                words[end]?.index ?? words[end - 1].end
              )
            ))
        ) {
          break;
        }
        next.set(end, Math.min(next.get(end) ?? Infinity, skipped + size));
      }
    } else {
      const end = nextFixedPosition(words, position, token);
      if (end !== null) {
        next.set(end, Math.min(next.get(end) ?? Infinity, skipped));
      }
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
const matchTemplate = (pattern, text, options) => {
  const folded = fold(text, options).trim();
  const words = templateTokens(folded, MESSAGE_TOKEN);
  const wordCount = words.filter(({ value }) => !isBoundary(value)).length;
  if (
    !wordCount ||
    wordCount > MAX_WORDS ||
    words.length > MAX_TEMPLATE_TOKENS
  ) {
    return null;
  }
  const tokens = templateTokens(
    fold(pattern, options)
      .trim()
      .replace(/\.\.\./gu, '…'),
    PATTERN_TOKEN
  ).map(({ value }) => value);
  const terms = tokens.filter((token) => !isBoundary(token));
  const fixed = terms.filter((token) => token !== '…').length;
  if (
    !fixed ||
    terms.length > MAX_WORDS ||
    tokens.length > MAX_TEMPLATE_TOKENS
  ) {
    return null;
  }
  if (!(options?.templateSubjects ?? sameQuestionSubjects)(pattern, text)) {
    return null;
  }
  const maxGap = Math.min(40, fixed * 3);
  // Keep one cheapest path per input position: O(pattern * words * maxGap).
  let states = new Map([[0, 0]]);
  for (const token of tokens) {
    states = advancePattern(states, token, words, folded, maxGap);
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
