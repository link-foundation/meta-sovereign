import { renderAnswer } from './question-profile.js';

// Shared matching settings are optional so existing saved actions keep their shape.
export const normalizeQuestionMatching = (input = {}) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('question matching must be an object');
  }
  const threshold = input.threshold === undefined ? 0.78 : input.threshold;
  if (
    typeof threshold !== 'number' ||
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > 1
  ) {
    throw new Error('matching threshold must be a finite number from 0 to 1');
  }
  if (
    input.caseSensitive !== undefined &&
    typeof input.caseSensitive !== 'boolean'
  ) {
    throw new Error('matching case sensitivity must be a boolean');
  }
  return { threshold, caseSensitive: input.caseSensitive === true };
};

export const normalizeMatchPage = (input) => {
  if (input === undefined) {
    return undefined;
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('match page must be an object');
  }
  const { offset = 0, limit = 20 } = input;
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 100000 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50
  ) {
    throw new Error(
      'match page needs an offset from 0 to 100000 and a limit from 1 to 50'
    );
  }
  return { offset, limit };
};

export const rankedMatchPage = (matches, context) => {
  if (!context.matchPage) {
    return {};
  }
  const { offset, limit } = context.matchPage;
  const ranked = [...matches].sort((a, b) => b.similarity - a.similarity);
  return {
    matchResults: {
      offset,
      limit,
      total: ranked.length,
      hasMore: offset + limit < ranked.length,
      complete:
        context.matchBudget?.exhausted !== true &&
        context.matchRulesLimited !== true,
      items: ranked.slice(offset, offset + limit).map((entry) => ({
        rule: entry.rule.id,
        question: entry.pattern,
        text: renderAnswer(entry.answer.text, context.profile).text,
        match: entry.match,
        similarity: entry.similarity,
        count: entry.answer.count,
        approved: entry.answer.approved,
        selected: entry === matches[0],
      })),
    },
  };
};
