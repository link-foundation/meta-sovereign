import { questionWords } from './question-match.js';
import { writeAnswerKnowledge } from './question-knowledge.js';
import { normalizeNoticePolicy } from './question-notice-policy.js';
import {
  finalPeriodMatches,
  normalizeAnswerFinalPeriod,
} from './question-final-period.js';
import {
  answerMatchBoundary,
  combineAnswerObservations,
} from './question-equivalents.js';

export const QA_POLICY_ID = 'qa-policy:reuse';
export const normalizeAnswerPolicy = (input = {}) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('answer policy must be an object');
  }
  if (
    input.punctuationEquivalent !== undefined &&
    typeof input.punctuationEquivalent !== 'boolean'
  ) {
    throw new Error('punctuation equivalence must be a boolean');
  }
  const rejected = input.rejected ?? [];
  if (
    !Array.isArray(rejected) ||
    rejected.length > 100 ||
    rejected.some(
      (text) => typeof text !== 'string' || !text.trim() || text.length > 12000
    )
  ) {
    throw new Error(
      'rejected answers must contain at most 100 nonempty texts of 12000 characters'
    );
  }
  return {
    id: QA_POLICY_ID,
    tokens: ['qa-policy'],
    rejected: [...new Set(rejected.map((text) => text.trim()))],
    punctuationEquivalent: input.punctuationEquivalent === true,
    answerFinalPeriod: normalizeAnswerFinalPeriod(input.answerFinalPeriod),
    notices: normalizeNoticePolicy(input.notices),
  };
};

// Compare full token phrases: Markdown/whitespace cannot revive a rejection,
// and a short rejected "No" does not match "Node.js".
export const rejectedAnswer = (text, policy = {}) => {
  const key = ` ${questionWords(text).join(' ')} `;
  return (policy.rejected ?? []).some((phrase) => {
    const words = questionWords(phrase);
    return words.length && key.includes(` ${words.join(' ')} `);
  });
};

export const readAnswerPolicy = async (store) =>
  normalizeAnswerPolicy((await store.get(QA_POLICY_ID)) ?? {});

export const saveAnswerPolicy = (store, input) =>
  writeAnswerKnowledge(store, async () => {
    const policy = normalizeAnswerPolicy(input);
    await store.put(policy);
    return policy;
  });

export const updateAnswerPolicy = (store, update) =>
  writeAnswerKnowledge(store, async () => {
    const policy = normalizeAnswerPolicy(update(await readAnswerPolicy(store)));
    await store.put(policy);
    return policy;
  });

export const equivalentAnswerVariants = (matches, policy = {}) => {
  if (!policy.punctuationEquivalent) {
    return finalPeriodMatches(matches, policy.answerFinalPeriod);
  }
  const groups = new Map();
  for (const match of matches) {
    const { answer } = match;
    const text = answer.text.trim().replace(/[.!。！]+$/u, '');
    const key = JSON.stringify([
      answerMatchBoundary(match),
      answer.approved,
      answer.canonical,
      text,
    ]);
    const group = groups.get(key) ?? [];
    group.push(match);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((group) => {
    const preferred = group.reduce((best, match) =>
      match.answer.count > best.answer.count ? match : best
    );
    return group.length === 1
      ? group
      : combineAnswerObservations(preferred, group);
  });
};
